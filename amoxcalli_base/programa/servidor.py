#!/usr/bin/env python3
"""
AMOXCALLI — La Casa de los Libros (Iniciativa Plantea)
Servidor HTTP Autónomo, Multihilo y Ultra-Ligero para Biblioteca Cultural Comunitaria.
- Cero dependencias externas (librería estándar de Python + pypdf embebido en lib/).
- Caché incremental persistente (.amoxcalli_cache.json) para indexar 500+ libros en < 2 ms.
- Caché LRU en memoria RAM para lectura instantánea de páginas PDF y capítulos EPUB.
- Soporte de colecciones automáticas mediante subcarpetas en libros/.
- Extracción de imágenes y recursos internos de EPUB (/api/epub/recurso).
"""

from collections import OrderedDict
import html
import http.server
import io
import json
import os
import posixpath
import re
import shutil
import socket
import sys
import threading
import time
import urllib.parse
import webbrowser
import xml.etree.ElementTree as ET
import zipfile

# Configurar salida UTF-8 en consolas de Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Importar pypdf desde lib/ local
DIR_ACTUAL = os.path.dirname(os.path.abspath(__file__))
DIR_LIB = os.path.join(DIR_ACTUAL, "lib")
if os.path.exists(DIR_LIB) and DIR_LIB not in sys.path:
    sys.path.insert(0, DIR_LIB)

try:
    import pypdf
except ImportError:
    pypdf = None

PUERTO_BASE = 8080
PUERTO_ACTIVO = 8080
DIRECTORIO_BASE = DIR_ACTUAL

# Resolver carpeta de acervo: soporta programa/libros o carpeta raíz libros/
_candidatos_libros = [
    os.path.join(DIR_ACTUAL, "libros"),
    os.path.abspath(os.path.join(DIR_ACTUAL, "..", "libros")),
]
CARPETA_LIBROS = next((p for p in _candidatos_libros if os.path.isdir(p)), os.path.join(DIR_ACTUAL, "libros"))
ARCHIVO_CACHE = os.path.join(CARPETA_LIBROS, ".amoxcalli_cache.json")

# Candados y cachés en memoria para alta concurrencia en aula (30+ alumnos simultáneos)
_CACHE_LOCK = threading.Lock()
_CATALOGO_MEMORIA = {
    "firma_directorio": None,
    "libros": [],
}
_PDF_READER_CACHE = OrderedDict()  # ruta_completa -> (mtime, PdfReader)
_EPUB_META_CACHE = OrderedDict()   # ruta_completa -> (mtime, dict_meta)
MAX_CACHE_ABIERTOS = 16


def obtener_ip_local():
    """Detecta la IP local de la computadora para compartir en la red Wi-Fi o aula."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def limpiar_nombre_coleccion(nombre_carpeta):
    """Convierte nombres de carpeta como '01_Literatura_Universal' en 'Literatura Universal'."""
    if not nombre_carpeta or nombre_carpeta in (".", ""):
        return "Acervo General"
    limpio = re.sub(r"^\d+[\s_\-\.]+", "", nombre_carpeta)
    limpio = limpio.replace("_", " ").replace("-", " ").strip()
    return limpio if limpio else "Acervo General"


def inferir_coleccion_por_titulo(titulo, nombre_archivo):
    """Infiere una sala temática cuando el archivo está en la raíz de libros/."""
    texto = f"{titulo} {nombre_archivo}".lower()
    if any(k in texto for k in ("historia", "mexico", "méxico", "crónica", "cronica", "revolucion", "prehispan", "náhuatl", "nahuatl", "códice", "codice")):
        return "Historia y Cultura"
    if any(k in texto for k in ("ciencia", "física", "fisica", "biología", "biologia", "astronom", "matemát", "matemat", "naturaleza", "cosmos")):
        return "Ciencia y Naturaleza"
    if any(k in texto for k in ("filosof", "ética", "etica", "polític", "politic", "ensayo", "pensamiento", "lógica", "logica", "lectura")):
        return "Pensamiento y Lectura"
    if any(k in texto for k in ("cuento", "novela", "poesía", "poesia", "literatura", "quijote", "fábula", "fabula", "teatro", "mito", "leyenda")):
        return "Literatura y Narrativa"
    if any(k in texto for k in ("manual", "guía", "guia", "operacion", "operación", "oficio", "taller", "salud", "campo", "agrícola", "agricola")):
        return "Guías y Manuales"
    return "Acervo General"


def resolver_ruta_libro(rel_archivo):
    """
    Resuelve de forma segura la ruta relativa de un libro dentro de CARPETA_LIBROS,
    previniendo ataques de Path Traversal (../).
    """
    if not rel_archivo:
        return None
    rel_limpio = rel_archivo.replace("\\", "/").lstrip("/")
    ruta_candidata = os.path.normpath(os.path.join(CARPETA_LIBROS, rel_limpio))
    base_norm = os.path.normpath(CARPETA_LIBROS)
    if not ruta_candidata.startswith(base_norm):
        return None
    if not os.path.isfile(ruta_candidata):
        return None
    return ruta_candidata


def obtener_pdf_reader(ruta_pdf):
    """Obtiene una instancia de PdfReader desde el caché LRU en memoria RAM."""
    if not pypdf or not os.path.exists(ruta_pdf):
        return None
    mtime = os.path.getmtime(ruta_pdf)
    with _CACHE_LOCK:
        if ruta_pdf in _PDF_READER_CACHE:
            cached_mtime, reader = _PDF_READER_CACHE.pop(ruta_pdf)
            if cached_mtime == mtime:
                _PDF_READER_CACHE[ruta_pdf] = (mtime, reader)
                return reader
    try:
        reader = pypdf.PdfReader(ruta_pdf)
        with _CACHE_LOCK:
            _PDF_READER_CACHE[ruta_pdf] = (mtime, reader)
            while len(_PDF_READER_CACHE) > MAX_CACHE_ABIERTOS:
                _PDF_READER_CACHE.popitem(last=False)
        return reader
    except Exception:
        return None


def extraer_metadata_epub(ruta_epub):
    """Extrae título, autor, tabla de contenidos y capítulos (spine) de un EPUB."""
    if not os.path.exists(ruta_epub):
        return {"titulo": None, "autor": None, "spine": [], "error": "Archivo no existe"}

    mtime = os.path.getmtime(ruta_epub)
    with _CACHE_LOCK:
        if ruta_epub in _EPUB_META_CACHE:
            cached_mtime, meta = _EPUB_META_CACHE.pop(ruta_epub)
            if cached_mtime == mtime:
                _EPUB_META_CACHE[ruta_epub] = (mtime, meta)
                return meta

    try:
        with zipfile.ZipFile(ruta_epub, "r") as z:
            nombres_zip = set(z.namelist())
            opf_path = "OEBPS/content.opf"
            if "META-INF/container.xml" in nombres_zip:
                container_data = z.read("META-INF/container.xml")
                root_c = ET.fromstring(container_data)
                for elem in root_c.iter():
                    if elem.tag.lower().endswith("rootfile") and elem.attrib.get("full-path"):
                        opf_path = elem.attrib["full-path"]
                        break

            opf_dir = posixpath.dirname(opf_path)
            opf_data = z.read(opf_path)
            root_opf = ET.fromstring(opf_data)

            titulo = None
            autor = None
            descripcion = None
            for elem in root_opf.iter():
                tag = elem.tag.lower()
                texto = (elem.text or "").strip()
                if not texto:
                    continue
                if tag.endswith("title") and not titulo:
                    titulo = texto
                elif tag.endswith("creator") and not autor:
                    autor = texto
                elif tag.endswith("description") and not descripcion:
                    descripcion = re.sub(r"<[^>]+>", "", texto)[:280]

            manifest = {}
            ncx_href = None
            nav_href = None
            for item in root_opf.iter():
                if item.tag.lower().endswith("item"):
                    i_id = item.attrib.get("id")
                    i_href = item.attrib.get("href")
                    media_type = item.attrib.get("media-type", "")
                    props = item.attrib.get("properties", "")
                    if i_id and i_href:
                        manifest[i_id] = i_href
                        if "ncx" in media_type or i_href.lower().endswith(".ncx"):
                            ncx_href = posixpath.join(opf_dir, i_href) if opf_dir else i_href
                        if "nav" in props:
                            nav_href = posixpath.join(opf_dir, i_href) if opf_dir else i_href

            # Intentar leer títulos de capítulos desde NCX o NAV
            mapa_titulos = {}
            if ncx_href and ncx_href in nombres_zip:
                try:
                    ncx_root = ET.fromstring(z.read(ncx_href))
                    ncx_dir = posixpath.dirname(ncx_href)
                    for navpoint in ncx_root.iter():
                        if navpoint.tag.lower().endswith("navpoint"):
                            label_txt = None
                            src_val = None
                            for sub in navpoint.iter():
                                stag = sub.tag.lower()
                                if stag.endswith("text") and sub.text and not label_txt:
                                    label_txt = sub.text.strip()
                                elif stag.endswith("content") and sub.attrib.get("src") and not src_val:
                                    src_val = sub.attrib["src"].split("#")[0]
                            if label_txt and src_val:
                                full_src = posixpath.normpath(posixpath.join(ncx_dir, src_val)) if ncx_dir else src_val
                                mapa_titulos[full_src] = label_txt
                except Exception:
                    pass

            spine = []
            idx_cap = 1
            for itemref in root_opf.iter():
                if itemref.tag.lower().endswith("itemref"):
                    idref = itemref.attrib.get("idref")
                    if idref in manifest:
                        href = manifest[idref]
                        full_href = posixpath.normpath(posixpath.join(opf_dir, href)) if opf_dir else href
                        titulo_cap = mapa_titulos.get(full_href)

                        # Si no hay título en el NCX, buscar el primer <h1>/<h2>/<title> del capítulo
                        if not titulo_cap and full_href in nombres_zip:
                            try:
                                raw_cap = z.read(full_href)[:4096].decode("utf-8", errors="ignore")
                                m_h = re.search(r"<(?:h1|h2|h3|title)[^>]*>(.*?)</(?:h1|h2|h3|title)>", raw_cap, re.IGNORECASE | re.DOTALL)
                                if m_h:
                                    limpio_h = re.sub(r"<[^>]+>", "", m_h.group(1)).strip()
                                    if limpio_h and len(limpio_h) < 90:
                                        titulo_cap = limpio_h
                            except Exception:
                                pass

                        if not titulo_cap:
                            titulo_cap = f"Capítulo {idx_cap}"

                        spine.append({
                            "id": idref,
                            "href": full_href,
                            "titulo": titulo_cap,
                        })
                        idx_cap += 1

            # Detectar imagen de portada del EPUB
            cover_href = None
            for elem in root_opf.iter():
                if elem.tag.lower().endswith("meta") and elem.attrib.get("name") == "cover":
                    c_id = elem.attrib.get("content")
                    if c_id and c_id in manifest:
                        href_c = manifest[c_id]
                        cover_href = posixpath.normpath(posixpath.join(opf_dir, href_c)) if opf_dir else href_c
                        break
            if not cover_href:
                for item in root_opf.iter():
                    if item.tag.lower().endswith("item"):
                        props = item.attrib.get("properties", "")
                        if "cover-image" in props and item.attrib.get("href"):
                            href_c = item.attrib["href"]
                            cover_href = posixpath.normpath(posixpath.join(opf_dir, href_c)) if opf_dir else href_c
                            break
            if not cover_href:
                for item in root_opf.iter():
                    if item.tag.lower().endswith("item"):
                        i_id = (item.attrib.get("id") or "").lower()
                        i_href = (item.attrib.get("href") or "").lower()
                        media = (item.attrib.get("media-type") or "").lower()
                        if ("cover" in i_id or "cover" in i_href) and media.startswith("image/"):
                            href_c = item.attrib["href"]
                            cover_href = posixpath.normpath(posixpath.join(opf_dir, href_c)) if opf_dir else href_c
                            break

            resultado = {
                "titulo": titulo or "Sin título",
                "autor": autor or "Acervo Comunitario",
                "descripcion": descripcion or "",
                "spine": spine,
                "opf_dir": opf_dir,
                "cover_href": cover_href,
            }
            with _CACHE_LOCK:
                _EPUB_META_CACHE[ruta_epub] = (mtime, resultado)
                while len(_EPUB_META_CACHE) > MAX_CACHE_ABIERTOS:
                    _EPUB_META_CACHE.popitem(last=False)
            return resultado
    except Exception as e:
        return {"titulo": None, "autor": None, "spine": [], "error": str(e)}


def reescribir_recursos_html_epub(html_str, rel_archivo, href_capitulo):
    """
    Reescribe las rutas relativas de imágenes (<img src="...">) dentro de un capítulo EPUB
    para que se sirvan limpiamente desde /api/epub/recurso y elimina scripts externos.
    """
    cap_dir = posixpath.dirname(href_capitulo)
    archivo_q = urllib.parse.quote(rel_archivo)

    # Eliminar etiquetas <script> por seguridad
    html_limpio = re.sub(r"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>", "", html_str, flags=re.IGNORECASE)

    def _reemplazar_src(match):
        prefijo = match.group(1)
        comilla = match.group(2)
        url_orig = match.group(3).strip()
        if url_orig.startswith(("http://", "https://", "data:", "/api/")):
            return match.group(0)
        url_sin_hash = url_orig.split("#")[0]
        ruta_interna = posixpath.normpath(posixpath.join(cap_dir, url_sin_hash)) if cap_dir else url_sin_hash
        nueva_url = f"/api/epub/recurso?archivo={archivo_q}&href={urllib.parse.quote(ruta_interna)}"
        return f"{prefijo}{comilla}{nueva_url}{comilla}"

    html_limpio = re.sub(r"(\b(?:src|xlink:href)=)(['\"])([^'\"]+)\2", _reemplazar_src, html_limpio, flags=re.IGNORECASE)
    return html_limpio


def formatear_texto_pagina(raw_text):
    """Convierte el texto extraído de una página PDF en HTML editorial limpio y estructurado."""
    if not raw_text or not raw_text.strip():
        return (
            "<div class='empty-page-notice'>"
            "<div class='empty-page-icon'>"
            "<svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"
            "<rect x='3' y='3' width='18' height='18' rx='2' ry='2'></rect>"
            "<circle cx='8.5' cy='8.5' r='1.5'></circle>"
            "<polyline points='21 15 16 10 5 21'></polyline>"
            "</svg>"
            "</div>"
            "<p><strong>Esta página contiene principalmente ilustraciones, esquemas o texto escaneado.</strong></p>"
            "<p style='font-size: 0.9em; margin-top: 6px;'>Puedes pulsar el botón <strong>«PDF Original»</strong> en la barra superior para visualizar la lámina exacta.</p>"
            "</div>"
        )
    lineas = raw_text.splitlines()
    parrafos = []
    parrafo_actual = []
    encabezados_clave = (
        "capítulo", "capitulo", "manual", "sección", "seccion",
        "título", "titulo", "matriz", "artículo", "articulo",
        "parte ", "introducción", "introduccion", "prólogo", "prologo",
        "conclusión", "conclusion", "anexo", "glosario"
    )

    for l in lineas:
        l_strip = l.strip()
        if not l_strip:
            if parrafo_actual:
                parrafos.append(" ".join(parrafo_actual))
                parrafo_actual = []
            continue

        es_titulo = (
            len(l_strip) < 75
            and not l_strip.endswith((".", ",", ";"))
            and (
                l_strip.isupper()
                or l_strip.lower().startswith(encabezados_clave)
                or re.match(r"^(?:[IVXLCDM]+\.|[0-9]+\.[0-9]*)\s+[A-ZÁÉÍÓÚÑ]", l_strip)
            )
        )
        if es_titulo:
            if parrafo_actual:
                parrafos.append(" ".join(parrafo_actual))
                parrafo_actual = []
            parrafos.append(f"<h3 class='reader-heading'>{html.escape(l_strip)}</h3>")
            continue

        # Detectar listas con viñetas
        if re.match(r"^(?:[\•\-\*\—]|\d+[\.\)])\s+", l_strip):
            if parrafo_actual:
                parrafos.append(" ".join(parrafo_actual))
                parrafo_actual = []
            parrafos.append(f"<p class='reader-paragraph reader-list-item'>{html.escape(l_strip)}</p>")
            continue

        parrafo_actual.append(html.escape(l_strip))
        if l_strip.endswith((".", ":", "?", "!", "»", '"')):
            parrafos.append("<p class='reader-paragraph'>" + " ".join(parrafo_actual) + "</p>")
            parrafo_actual = []

    if parrafo_actual:
        parrafos.append("<p class='reader-paragraph'>" + " ".join(parrafo_actual) + "</p>")

    resultado = []
    for p in parrafos:
        if p.strip():
            resultado.append(p if p.startswith("<") else f"<p class='reader-paragraph'>{p}</p>")
    return "\n".join(resultado)


def cargar_cache_disco():
    """Carga el caché persistente de metadatos de libros desde el disco."""
    if not os.path.exists(ARCHIVO_CACHE):
        return {}
    try:
        with open(ARCHIVO_CACHE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def guardar_cache_disco(cache_dict):
    """Guarda el caché persistente de metadatos de libros en disco."""
    try:
        with open(ARCHIVO_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache_dict, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def detectar_portada_libro(ruta_completa, rel_path, ext_clean):
    """
    Detecta si el libro cuenta con imagen de portada (archivo .jpg/.png/.webp acompañante
    o portada interna declarada dentro del EPUB).
    """
    dir_libro = os.path.dirname(ruta_completa)
    nombre_base = os.path.splitext(os.path.basename(ruta_completa))[0]
    candidatos = [
        os.path.join(dir_libro, f"{nombre_base}.jpg"),
        os.path.join(dir_libro, f"{nombre_base}.jpeg"),
        os.path.join(dir_libro, f"{nombre_base}.png"),
        os.path.join(dir_libro, f"{nombre_base}.webp"),
        os.path.join(dir_libro, f"{nombre_base}_portada.jpg"),
        os.path.join(dir_libro, f"{nombre_base}_portada.png"),
        os.path.join(dir_libro, f"{nombre_base}_cover.jpg"),
        os.path.join(dir_libro, f"{nombre_base}_cover.png"),
        os.path.join(dir_libro, "portadas", f"{nombre_base}.jpg"),
        os.path.join(dir_libro, "portadas", f"{nombre_base}.png"),
        os.path.join(CARPETA_LIBROS, "portadas", f"{nombre_base}.jpg"),
        os.path.join(CARPETA_LIBROS, "portadas", f"{nombre_base}.png"),
        os.path.join(dir_libro, "cover.jpg"),
        os.path.join(dir_libro, "cover.png"),
        os.path.join(dir_libro, "portada.jpg"),
        os.path.join(dir_libro, "portada.png"),
    ]
    for c in candidatos:
        if os.path.isfile(c):
            return True, f"/api/libro/portada?archivo={urllib.parse.quote(rel_path)}"

    if ext_clean == "epub":
        meta = extraer_metadata_epub(ruta_completa)
        if meta.get("cover_href"):
            return True, f"/api/libro/portada?archivo={urllib.parse.quote(rel_path)}"

    return False, None


def escanear_libros():
    """
    Escanea recursivamente la carpeta 'libros/' e indexa todos los PDFs y EPUBs.
    Utiliza caché en memoria y en disco (.amoxcalli_cache.json) para responder en < 2 ms
    incluso con colecciones de 500+ libros.
    """
    if not os.path.exists(CARPETA_LIBROS):
        os.makedirs(CARPETA_LIBROS, exist_ok=True)

    entradas_archivos = []
    for root, dirs, files in os.walk(CARPETA_LIBROS):
        # Ignorar carpetas ocultas
        dirs[:] = sorted([d for d in dirs if not d.startswith(".")])
        for f in sorted(files):
            if f.startswith("."):
                continue
            _, ext = os.path.splitext(f)
            ext_clean = ext.lower().lstrip(".")
            if ext_clean in ("pdf", "epub"):
                ruta_abs = os.path.join(root, f)
                rel_path = os.path.relpath(ruta_abs, CARPETA_LIBROS).replace("\\", "/")
                try:
                    stat = os.stat(ruta_abs)
                    entradas_archivos.append((rel_path, ruta_abs, ext_clean, stat.st_size, round(stat.st_mtime, 2)))
                except OSError:
                    continue

    # Firma rápida del estado actual del directorio
    firma_actual = tuple((rel, sz, mt) for rel, _, _, sz, mt in entradas_archivos)

    with _CACHE_LOCK:
        if _CATALOGO_MEMORIA["firma_directorio"] == firma_actual:
            return _CATALOGO_MEMORIA["libros"]

    cache_disco = cargar_cache_disco()
    nuevo_cache_disco = {}
    catalogo = []
    hubo_cambios_cache = False
    id_counter = 1

    for rel_path, ruta_completa, ext_clean, tamano_bytes, mtime in entradas_archivos:
        clave_firma = f"{tamano_bytes}:{mtime}"
        registro_previo = cache_disco.get(rel_path)

        if registro_previo and registro_previo.get("_firma") == clave_firma:
            item = dict(registro_previo)
            item["id"] = id_counter
            nuevo_cache_disco[rel_path] = registro_previo
            catalogo.append(item)
            id_counter += 1
            continue

        # Archivo nuevo o modificado: extraer metadatos
        hubo_cambios_cache = True
        tamano_mb = round(tamano_bytes / (1024 * 1024), 2)
        tamano_str = f"{tamano_mb} MB" if tamano_mb >= 1 else f"{max(1, round(tamano_bytes / 1024, 1))} KB"

        nombre_base = os.path.splitext(os.path.basename(rel_path))[0]
        carpeta_padre = os.path.dirname(rel_path).split("/")[0] if "/" in rel_path else ""

        titulo = nombre_base.replace("_", " ").replace("-", " ").strip()
        autor = "Acervo Comunitario"
        num_paginas = None

        if ext_clean == "epub":
            meta = extraer_metadata_epub(ruta_completa)
            if meta.get("titulo") and meta["titulo"] != "Sin título":
                titulo = meta["titulo"]
            if meta.get("autor") and meta["autor"] != "Biblioteca Digital":
                autor = meta["autor"]
            if meta.get("spine"):
                num_paginas = len(meta["spine"])
        elif ext_clean == "pdf" and pypdf:
            reader = obtener_pdf_reader(ruta_completa)
            if reader:
                try:
                    num_paginas = len(reader.pages)
                    if reader.metadata:
                        meta_title = getattr(reader.metadata, "title", None)
                        meta_author = getattr(reader.metadata, "author", None)
                        if meta_title:
                            t_clean = str(meta_title).strip()
                            t_low = t_clean.lower()
                            basura_titulos = ("(anonymous)", "anonymous", "untitled", "sin titulo", "sin título", "none", "(none)", "documento")
                            if len(t_clean) > 2 and t_low not in basura_titulos and not t_low.endswith((".pdf", ".doc", ".docx")):
                                titulo = t_clean
                        if meta_author:
                            a_clean = str(meta_author).strip()
                            if a_clean and a_clean.lower() not in ("(anonymous)", "anonymous", "unknown", "none", "user", "admin"):
                                autor = a_clean
                except Exception:
                    pass

        if " - " in titulo and autor in ("Acervo Comunitario", "Biblioteca Digital"):
            partes = titulo.split(" - ", 1)
            autor = partes[0].strip()
            titulo = partes[1].strip()

        if carpeta_padre:
            coleccion = limpiar_nombre_coleccion(carpeta_padre)
        else:
            coleccion = inferir_coleccion_por_titulo(titulo, rel_path)

        tiene_portada, portada_url = detectar_portada_libro(ruta_completa, rel_path, ext_clean)

        item_cache = {
            "_firma": clave_firma,
            "id": id_counter,
            "titulo": titulo,
            "autor": autor,
            "coleccion": coleccion,
            "archivo": rel_path,
            "formato": ext_clean.upper(),
            "tamano": tamano_str,
            "tamano_bytes": tamano_bytes,
            "paginas": num_paginas,
            "tiene_portada": tiene_portada,
            "portada_url": portada_url,
            "ruta": f"/libros/{urllib.parse.quote(rel_path)}",
        }
        nuevo_cache_disco[rel_path] = item_cache
        catalogo.append(dict(item_cache))
        id_counter += 1

    if hubo_cambios_cache or len(nuevo_cache_disco) != len(cache_disco):
        guardar_cache_disco(nuevo_cache_disco)

    with _CACHE_LOCK:
        _CATALOGO_MEMORIA["firma_directorio"] = firma_actual
        _CATALOGO_MEMORIA["libros"] = catalogo

    return catalogo


ADIVINAR_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".css": "text/css",
}


class ManejadorBiblioteca(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORIO_BASE, **kwargs)

    def log_message(self, format, *args):
        # Silenciar logs ruidosos por cada recurso para mantener la consola limpia y rápida
        pass

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def es_cliente_local(self):
        """Verifica si la petición proviene de la máquina anfitriona (localhost)."""
        cliente_ip = self.client_address[0]
        return cliente_ip in ("127.0.0.1", "::1", "localhost")

    def enviar_json(self, datos, codigo=200):
        resp = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def do_GET(self):
        url_p = urllib.parse.urlparse(self.path)
        ruta = url_p.path
        params = urllib.parse.parse_qs(url_p.query)

        # 1. API: Listado de libros (con caché instantáneo)
        if ruta == "/api/libros":
            libros = escanear_libros()
            self.enviar_json(libros)
            return

        # 2. API: Info de red para dispositivos móviles en aula
        if ruta == "/api/info":
            ip_lan = obtener_ip_local()
            libros = escanear_libros()
            colecciones = sorted(list({b.get("coleccion", "Acervo General") for b in libros}))
            info = {
                "proyecto": "Amoxcalli",
                "iniciativa": "Iniciativa Plantea",
                "ip_local": "127.0.0.1",
                "ip_lan": ip_lan,
                "puerto": PUERTO_ACTIVO,
                "url_local": f"http://localhost:{PUERTO_ACTIVO}",
                "url_lan": f"http://{ip_lan}:{PUERTO_ACTIVO}",
                "total_libros": len(libros),
                "colecciones": colecciones,
                "es_anfitrion": self.es_cliente_local(),
            }
            self.enviar_json(info)
            return

        # 3. API: Estructura interna y tabla de contenidos de un EPUB
        if ruta == "/api/epub/info":
            archivo = params.get("archivo", [None])[0]
            ruta_epub = resolver_ruta_libro(archivo)
            if not ruta_epub:
                self.enviar_json({"error": "Libro EPUB no encontrado"}, 404)
                return
            info_epub = extraer_metadata_epub(ruta_epub)
            self.enviar_json(info_epub)
            return

        # 4. API: Contenido HTML de un capítulo de EPUB (con reescritura de imágenes internas)
        if ruta == "/api/epub/capitulo":
            archivo = params.get("archivo", [None])[0]
            href = params.get("href", [None])[0]
            ruta_epub = resolver_ruta_libro(archivo)
            if not ruta_epub or not href:
                self.send_error(404, "Libro o capítulo EPUB no encontrado")
                return

            try:
                with zipfile.ZipFile(ruta_epub, "r") as z:
                    href_norm = href.replace("\\", "/")
                    if href_norm not in z.namelist():
                        # Búsqueda flexible por nombre de archivo si difiere ruta relativa
                        coincidencias = [n for n in z.namelist() if n.endswith(os.path.basename(href_norm))]
                        if coincidencias:
                            href_norm = coincidencias[0]
                    contenido_html = z.read(href_norm).decode("utf-8", errors="replace")

                contenido_html = reescribir_recursos_html_epub(contenido_html, archivo, href_norm)
                resp = contenido_html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                return
            except Exception as e:
                self.send_error(500, f"Error al extraer capítulo: {str(e)}")
                return

        # 5. API: Recurso interno de EPUB (imágenes, mapas, ilustraciones dentro del .epub)
        if ruta == "/api/epub/recurso":
            archivo = params.get("archivo", [None])[0]
            href = params.get("href", [None])[0]
            ruta_epub = resolver_ruta_libro(archivo)
            if not ruta_epub or not href:
                self.send_error(404, "Recurso no encontrado")
                return
            try:
                with zipfile.ZipFile(ruta_epub, "r") as z:
                    href_norm = posixpath.normpath(href.replace("\\", "/")).lstrip("/")
                    if href_norm not in z.namelist():
                        coincidencias = [n for n in z.namelist() if n.endswith(os.path.basename(href_norm))]
                        if coincidencias:
                            href_norm = coincidencias[0]
                    datos_bin = z.read(href_norm)
                ext = os.path.splitext(href_norm)[1].lower()
                mime = ADIVINAR_MIME.get(ext, "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(datos_bin)))
                self.end_headers()
                self.wfile.write(datos_bin)
                return
            except Exception:
                self.send_error(404, "No se pudo leer el recurso del EPUB")
                return

        # 6. API: Portada de un libro (imagen acompañante o portada interna de EPUB)
        if ruta == "/api/libro/portada":
            archivo = params.get("archivo", [None])[0]
            ruta_libro = resolver_ruta_libro(archivo)
            if not ruta_libro:
                self.send_error(404, "Libro no encontrado")
                return

            dir_libro = os.path.dirname(ruta_libro)
            nombre_base = os.path.splitext(os.path.basename(ruta_libro))[0]
            candidatos = [
                os.path.join(dir_libro, f"{nombre_base}.jpg"),
                os.path.join(dir_libro, f"{nombre_base}.jpeg"),
                os.path.join(dir_libro, f"{nombre_base}.png"),
                os.path.join(dir_libro, f"{nombre_base}.webp"),
                os.path.join(dir_libro, f"{nombre_base}_portada.jpg"),
                os.path.join(dir_libro, f"{nombre_base}_portada.png"),
                os.path.join(dir_libro, f"{nombre_base}_cover.jpg"),
                os.path.join(dir_libro, f"{nombre_base}_cover.png"),
                os.path.join(dir_libro, "portadas", f"{nombre_base}.jpg"),
                os.path.join(dir_libro, "portadas", f"{nombre_base}.png"),
                os.path.join(CARPETA_LIBROS, "portadas", f"{nombre_base}.jpg"),
                os.path.join(CARPETA_LIBROS, "portadas", f"{nombre_base}.png"),
                os.path.join(dir_libro, "cover.jpg"),
                os.path.join(dir_libro, "cover.png"),
                os.path.join(dir_libro, "portada.jpg"),
                os.path.join(dir_libro, "portada.png"),
            ]
            for c in candidatos:
                if os.path.isfile(c):
                    ext = os.path.splitext(c)[1].lower()
                    mime = ADIVINAR_MIME.get(ext, "image/jpeg")
                    try:
                        with open(c, "rb") as f:
                            datos = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", mime)
                        self.send_header("Content-Length", str(len(datos)))
                        self.send_header("Cache-Control", "public, max-age=86400")
                        self.end_headers()
                        self.wfile.write(datos)
                        return
                    except Exception:
                        pass

            if ruta_libro.lower().endswith(".epub"):
                meta = extraer_metadata_epub(ruta_libro)
                cover_href = meta.get("cover_href")
                if cover_href:
                    try:
                        with zipfile.ZipFile(ruta_libro, "r") as z:
                            if cover_href in z.namelist():
                                datos = z.read(cover_href)
                                ext = os.path.splitext(cover_href)[1].lower()
                                mime = ADIVINAR_MIME.get(ext, "image/jpeg")
                                self.send_response(200)
                                self.send_header("Content-Type", mime)
                                self.send_header("Content-Length", str(len(datos)))
                                self.send_header("Cache-Control", "public, max-age=86400")
                                self.end_headers()
                                self.wfile.write(datos)
                                return
                    except Exception:
                        pass

            self.send_error(404, "Portada no disponible")
            return

        # 7. API: Info de un archivo PDF
        if ruta == "/api/pdf/info":
            archivo = params.get("archivo", [None])[0]
            ruta_pdf = resolver_ruta_libro(archivo)
            if not ruta_pdf:
                self.enviar_json({"error": "Libro PDF no encontrado"}, 404)
                return

            num_paginas = 1
            nombre_limpio = os.path.splitext(os.path.basename(archivo))[0].replace("_", " ")
            titulo = nombre_limpio
            autor = "Acervo Comunitario"

            reader = obtener_pdf_reader(ruta_pdf)
            if reader:
                try:
                    num_paginas = len(reader.pages)
                    if reader.metadata:
                        mt = getattr(reader.metadata, "title", None)
                        ma = getattr(reader.metadata, "author", None)
                        if mt and str(mt).strip().lower() not in ("(anonymous)", "anonymous", "untitled", "sin titulo", "none", "(none)"):
                            titulo = str(mt).strip()
                        if ma and str(ma).strip().lower() not in ("(anonymous)", "anonymous", "unknown", "none", "user", "admin"):
                            autor = str(ma).strip()
                except Exception:
                    pass

            self.enviar_json({
                "archivo": archivo,
                "titulo": titulo,
                "autor": autor,
                "num_paginas": num_paginas,
                "url_original": f"/libros/{urllib.parse.quote(archivo.replace(os.sep, '/'))}",
            })
            return

        # 7. API: Contenido HTML de una página de PDF (para lectura y subrayado web en móvil/PC)
        if ruta == "/api/pdf/pagina":
            archivo = params.get("archivo", [None])[0]
            num_pag_str = params.get("pagina", ["1"])[0]
            ruta_pdf = resolver_ruta_libro(archivo)
            if not ruta_pdf:
                self.send_error(404, "Libro PDF no encontrado")
                return

            try:
                num_pag = max(1, int(num_pag_str))
            except ValueError:
                num_pag = 1

            html_contenido = "<p>No se pudo procesar la página del documento.</p>"
            reader = obtener_pdf_reader(ruta_pdf)
            if reader:
                try:
                    idx = num_pag - 1
                    if 0 <= idx < len(reader.pages):
                        raw_text = reader.pages[idx].extract_text()
                        html_contenido = formatear_texto_pagina(raw_text)
                    else:
                        html_contenido = "<p>Página fuera de rango.</p>"
                except Exception as e:
                    html_contenido = f"<p>Error al procesar página: {html.escape(str(e))}</p>"

            resp = html_contenido.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

        # 8. Servicio directo y seguro de archivos de libros (.epub, .pdf, portadas)
        if ruta.startswith("/libros/"):
            rel_archivo = urllib.parse.unquote(ruta[len("/libros/"):])
            ruta_disco = resolver_ruta_libro(rel_archivo)
            if ruta_disco and os.path.isfile(ruta_disco):
                ext = os.path.splitext(ruta_disco)[1].lower()
                mime = ADIVINAR_MIME.get(ext, "application/octet-stream")
                tam = os.path.getsize(ruta_disco)
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(tam))
                self.send_header("Content-Disposition", f'inline; filename="{os.path.basename(ruta_disco)}"')
                self.end_headers()
                try:
                    with open(ruta_disco, "rb") as f:
                        shutil.copyfileobj(f, self.wfile)
                except Exception:
                    pass
                return

        # Servicio estático normativo
        super().do_GET()

    def do_POST(self):
        url_p = urllib.parse.urlparse(self.path)
        ruta = url_p.path
        params = urllib.parse.parse_qs(url_p.query)

        # Control de seguridad: solo la máquina anfitriona (profesor) puede realizar acciones de administración
        if not self.es_cliente_local():
            self.enviar_json({
                "ok": False,
                "error": "Acción no autorizada: Solo la computadora anfitriona del profesor (localhost) puede administrar el acervo."
            }, 403)
            return

        # 1. API ADMIN: Subir paquete temático completo (.zip)
        if ruta == "/api/admin/subir_paquete":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
            except (ValueError, TypeError):
                content_length = 0

            if content_length == 0 or content_length > 150 * 1024 * 1024:
                self.enviar_json({"ok": False, "error": "El paquete excede el límite máximo de 150 MB o está vacío."}, 400)
                return

            try:
                raw_zip = self.rfile.read(content_length)
                if not zipfile.is_zipfile(io.BytesIO(raw_zip)):
                    self.enviar_json({"ok": False, "error": "El archivo proporcionado no es un paquete ZIP válido."}, 400)
                    return

                # Detectar nombre sugerido de carpeta
                nombre_carpeta_param = params.get("nombre_carpeta", [None])[0]
                if not nombre_carpeta_param:
                    nombre_archivo_orig = self.headers.get("X-Nombre-Archivo", "")
                    if nombre_archivo_orig:
                        stem = os.path.splitext(os.path.basename(urllib.parse.unquote(nombre_archivo_orig)))[0]
                        nombre_carpeta_param = stem.replace("Paquete_", "").replace("paquete_", "").strip()

                with zipfile.ZipFile(io.BytesIO(raw_zip), "r") as zf:
                    infolist = zf.infolist()
                    if not infolist:
                        self.enviar_json({"ok": False, "error": "El paquete ZIP no contiene archivos."}, 400)
                        return

                    # Detectar si el ZIP ya viene con una subcarpeta raíz contenedora
                    carpetas_raiz = {item.filename.split("/")[0] for item in infolist if "/" in item.filename}
                    tiene_archivos_sueltos = any("/" not in item.filename and not item.is_dir() for item in infolist)

                    if len(carpetas_raiz) == 1 and not tiene_archivos_sueltos:
                        carpeta_destino_nombre = list(carpetas_raiz)[0]
                    else:
                        carpeta_destino_nombre = nombre_carpeta_param or "Coleccion_Importada"

                    # Sanitizar nombre de carpeta
                    carpeta_destino_nombre = re.sub(r'[\/\\:\*\?"<>\|]', '_', carpeta_destino_nombre).strip()
                    if not carpeta_destino_nombre:
                        carpeta_destino_nombre = "Coleccion_Importada"

                    dir_destino = os.path.join(CARPETA_LIBROS, carpeta_destino_nombre)
                    os.makedirs(dir_destino, exist_ok=True)

                    libros_agregados = 0
                    portadas_agregadas = 0

                    for item in infolist:
                        if item.is_dir():
                            continue
                        base_fname = os.path.basename(item.filename)
                        if not base_fname:
                            continue

                        ext = os.path.splitext(base_fname)[1].lower()
                        # Extensiones permitidas (seguridad frente a binarios o ejecutables)
                        if ext not in (".epub", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".json", ".txt"):
                            continue

                        ruta_final = os.path.join(dir_destino, base_fname)
                        with zf.open(item) as src, open(ruta_final, "wb") as dst:
                            shutil.copyfileobj(src, dst)

                        if ext in (".epub", ".pdf"):
                            libros_agregados += 1
                        elif ext in (".jpg", ".jpeg", ".png", ".webp"):
                            portadas_agregadas += 1

                # Invalidar cachés en memoria
                with _CACHE_LOCK:
                    _EPUB_META_CACHE.clear()
                    _CATALOGO_MEMORIA["firma_directorio"] = None

                self.enviar_json({
                    "ok": True,
                    "mensaje": f"Paquete '{carpeta_destino_nombre}' integrado con éxito ({libros_agregados} obras incorporadas).",
                    "carpeta": carpeta_destino_nombre,
                    "total_libros": libros_agregados,
                    "total_portadas": portadas_agregadas
                })
                return
            except Exception as e:
                self.enviar_json({"ok": False, "error": f"Error al procesar paquete ZIP: {str(e)}"}, 500)
                return

        # 2. API ADMIN: Subir libro o portada individual (.epub, .pdf, .jpg, .png)
        if ruta == "/api/admin/subir_libro":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
            except (ValueError, TypeError):
                content_length = 0

            if content_length == 0 or content_length > 100 * 1024 * 1024:
                self.enviar_json({"ok": False, "error": "El archivo excede el límite de 100 MB o está vacío."}, 400)
                return

            nombre_archivo = params.get("archivo", [None])[0] or self.headers.get("X-Nombre-Archivo", "")
            nombre_archivo = os.path.basename(urllib.parse.unquote(nombre_archivo)).strip()
            if not nombre_archivo:
                self.enviar_json({"ok": False, "error": "Nombre de archivo no especificado."}, 400)
                return

            ext = os.path.splitext(nombre_archivo)[1].lower()
            if ext not in (".epub", ".pdf", ".jpg", ".jpeg", ".png", ".webp"):
                self.enviar_json({"ok": False, "error": f"Formato '{ext}' no admitido. Usa .epub, .pdf, .jpg o .png."}, 400)
                return

            coleccion = params.get("coleccion", ["Acervo General"])[0]
            coleccion = re.sub(r'[\/\\:\*\?"<>\|]', '_', urllib.parse.unquote(coleccion)).strip()
            if not coleccion or coleccion == "Acervo General":
                dir_destino = CARPETA_LIBROS
            else:
                dir_destino = os.path.join(CARPETA_LIBROS, coleccion)
                os.makedirs(dir_destino, exist_ok=True)

            ruta_final = os.path.join(dir_destino, nombre_archivo)

            try:
                raw_bytes = self.rfile.read(content_length)
                if ext == ".epub" and not zipfile.is_zipfile(io.BytesIO(raw_bytes)):
                    self.enviar_json({"ok": False, "error": "El archivo EPUB está dañado o no es válido."}, 400)
                    return

                with open(ruta_final, "wb") as f:
                    f.write(raw_bytes)

                with _CACHE_LOCK:
                    _EPUB_META_CACHE.clear()
                    _CATALOGO_MEMORIA["firma_directorio"] = None

                self.enviar_json({
                    "ok": True,
                    "mensaje": f"Archivo '{nombre_archivo}' integrado con éxito al acervo.",
                    "archivo": nombre_archivo,
                    "coleccion": coleccion
                })
                return
            except Exception as e:
                self.enviar_json({"ok": False, "error": f"Error al guardar archivo: {str(e)}"}, 500)
                return

        # 3. API ADMIN: Eliminar libro y su portada asociada de forma segura
        if ruta == "/api/admin/eliminar_obra":
            archivo_rel = params.get("archivo", [None])[0]
            if not archivo_rel:
                self.enviar_json({"ok": False, "error": "Parámetro 'archivo' no especificado."}, 400)
                return

            ruta_disco = resolver_ruta_libro(archivo_rel)
            if not ruta_disco or not os.path.isfile(ruta_disco):
                self.enviar_json({"ok": False, "error": "La obra no existe en el acervo."}, 404)
                return

            try:
                os.remove(ruta_disco)

                # Intentar eliminar portada acompañante con el mismo nombre
                stem = os.path.splitext(ruta_disco)[0]
                for ext_c in (".jpg", ".jpeg", ".png", ".webp"):
                    cov_cand = stem + ext_c
                    if os.path.isfile(cov_cand):
                        try:
                            os.remove(cov_cand)
                        except Exception:
                            pass

                # Si la carpeta quedó completamente vacía, removerla si no es CARPETA_LIBROS
                dir_padre = os.path.dirname(ruta_disco)
                if os.path.abspath(dir_padre) != os.path.abspath(CARPETA_LIBROS):
                    archivos_restantes = [f for f in os.listdir(dir_padre) if not f.startswith(".")]
                    if not archivos_restantes:
                        try:
                            shutil.rmtree(dir_padre)
                        except Exception:
                            pass

                with _CACHE_LOCK:
                    _EPUB_META_CACHE.clear()
                    _CATALOGO_MEMORIA["firma_directorio"] = None

                self.enviar_json({"ok": True, "mensaje": "Obra retirada del acervo con éxito."})
                return
            except Exception as e:
                self.enviar_json({"ok": False, "error": f"Error al eliminar obra: {str(e)}"}, 500)
                return

        # 4. API ADMIN: Eliminar una sala temática completa
        if ruta == "/api/admin/eliminar_sala":
            coleccion = params.get("coleccion", [None])[0]
            if not coleccion:
                self.enviar_json({"ok": False, "error": "Parámetro 'coleccion' no especificado."}, 400)
                return

            col_limpia = re.sub(r'[\/\\:\*\?"<>\|]', '_', urllib.parse.unquote(coleccion)).strip()
            dir_sala = os.path.join(CARPETA_LIBROS, col_limpia)

            if not os.path.isdir(dir_sala) or os.path.abspath(dir_sala) == os.path.abspath(CARPETA_LIBROS):
                self.enviar_json({"ok": False, "error": "La sala especificada no existe o no se puede eliminar."}, 404)
                return

            try:
                shutil.rmtree(dir_sala)
                with _CACHE_LOCK:
                    _EPUB_META_CACHE.clear()
                    _CATALOGO_MEMORIA["firma_directorio"] = None

                self.enviar_json({"ok": True, "mensaje": f"Sala temática '{coleccion}' y todas sus obras eliminadas con éxito."})
                return
            except Exception as e:
                self.enviar_json({"ok": False, "error": f"Error al eliminar sala: {str(e)}"}, 500)
                return

        self.enviar_json({"ok": False, "error": "Ruta POST no encontrada."}, 404)


class ServidorReutilizable(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def server_bind(self):
        super(http.server.HTTPServer, self).server_bind()
        self.server_name = "0.0.0.0"
        self.server_port = self.server_address[1]


def crear_servidor_con_puerto_disponible(puerto_inicial=8080):
    """Intenta enlazar en el puerto 8080; si está ocupado, busca automáticamente entre 8080 y 8095."""
    for p in range(puerto_inicial, puerto_inicial + 16):
        try:
            srv = ServidorReutilizable(("0.0.0.0", p), ManejadorBiblioteca)
            return srv, p
        except OSError:
            continue
    raise RuntimeError("No se encontró un puerto libre entre 8080 y 8095.")


def imprimir_banner_inicio(puerto, ip_lan, total_libros, dt_ms):
    # Asegurar codificación utf-8 / fallback seguro para stdout en Windows/Linux
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    usa_color = True
    if os.environ.get("NO_COLOR"):
        usa_color = False
    elif not hasattr(sys.stdout, "isatty") or not sys.stdout.isatty():
        usa_color = False
    elif os.name == "nt":
        try:
            import ctypes
            k = ctypes.windll.kernel32
            h = k.GetStdHandle(-11)
            m = ctypes.c_ulong()
            if k.GetConsoleMode(h, ctypes.byref(m)):
                k.SetConsoleMode(h, m.value | 0x0004)
            else:
                usa_color = False
        except Exception:
            usa_color = False

    if usa_color:
        C_CYAN   = "\033[1;36m"
        C_BLUE   = "\033[1;34m"
        C_GREEN  = "\033[1;32m"
        C_YELLOW = "\033[1;33m"
        C_BOLD   = "\033[1m"
        C_DIM    = "\033[2m"
        C_RESET  = "\033[0m"
    else:
        C_CYAN = C_BLUE = C_GREEN = C_YELLOW = C_BOLD = C_DIM = C_RESET = ""

    def ch(simbolo, fallback):
        try:
            enc = sys.stdout.encoding or "utf-8"
            simbolo.encode(enc)
            return simbolo
        except Exception:
            return fallback

    sym_dot    = ch("●", "[*]")
    sym_arrow  = ch("➜", "->")
    sym_bullet = ch("•", "-")
    sym_bulb   = ch("💡", "[i]")
    sym_qr     = ch("📱", "[QR]")

    ascii_art = f"""{C_CYAN}    ___    __  ___ ____  _  __ ______ ___    __    __    ____
   /   |  /  |/  // __ \\| |/ // ____//   |  / /   / /   /  _/
  / /| | / /|_/ // / / /|   // /    / /| | / /   / /    / /  
 / ___ |/ /  / // /_/ //   |/ /___ / ___ |/ /___/ /____/ /   
/_/  |_/_/  /_/ \\____//_/|_|\\____//_/  |_/_____/_____/___/   {C_RESET}"""

    sep_double = "=" * 67
    sep_single = "-" * 67

    print(f"\n{C_BLUE}{sep_double}{C_RESET}")
    print(ascii_art)
    print(f"   {C_BOLD}LA CASA DE LOS LIBROS{C_RESET} — {C_CYAN}{C_BOLD}INICIATIVA PLANTEA{C_RESET} {C_BLUE}[USB READY]{C_RESET}")
    print(f"   {C_DIM}Servidor Cultural Comunitario y de Aula · 100% Sin Internet{C_RESET}")
    print(f"{C_BLUE}{sep_double}{C_RESET}")
    print(f" {C_GREEN}{sym_dot}{C_RESET} {C_BOLD}Estado del Servidor{C_RESET} : {C_GREEN}ACTIVO{C_RESET} {C_DIM}({total_libros} libros listos en {dt_ms} ms){C_RESET}\n")
    print(f"   {C_BOLD}En esta computadora:{C_RESET}")
    print(f"   {C_CYAN}{sym_arrow}{C_RESET}  {C_BOLD}http://localhost:{puerto}{C_RESET}\n")
    print(f"   {C_BOLD}En la red del aula (Wi-Fi para celulares y tabletas):{C_RESET}")
    print(f"   {C_CYAN}{sym_arrow}{C_RESET}  {C_GREEN}{C_BOLD}http://{ip_lan}:{puerto}{C_RESET}  {C_DIM}({sym_qr} código QR disponible en pantalla){C_RESET}")
    print(f"{C_BLUE}{sep_single}{C_RESET}")
    print(f" {C_YELLOW}{sym_bulb} Consejos para el aula:{C_RESET}")
    print(f"  {sym_bullet} {C_BOLD}Agregar libros:{C_RESET} Copia archivos .epub o .pdf dentro de {C_CYAN}libros/{C_RESET}")
    print(f"  {sym_bullet} {C_BOLD}En comunidad:{C_RESET}   Alumnos leen y subrayan simultáneamente sin gastar datos.")
    print(f"  {sym_bullet} {C_BOLD}Para salir:{C_RESET}     Presiona {C_BOLD}Ctrl + C{C_RESET} en esta terminal.")
    print(f"{C_BLUE}{sep_double}{C_RESET}\n")
    sys.stdout.flush()


def iniciar():
    global PUERTO_ACTIVO
    ip_lan = obtener_ip_local()
    servidor, PUERTO_ACTIVO = crear_servidor_con_puerto_disponible(PUERTO_BASE)

    # Pre-calentar el catálogo al arrancar
    t0 = time.time()
    catalogo_inicial = escanear_libros()
    dt_ms = round((time.time() - t0) * 1000, 1)

    imprimir_banner_inicio(PUERTO_ACTIVO, ip_lan, len(catalogo_inicial), dt_ms)

    if "--no-browser" not in sys.argv:
        def abrir():
            try:
                webbrowser.open(f"http://localhost:{PUERTO_ACTIVO}")
            except Exception:
                pass
        threading.Timer(0.8, abrir).start()

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n[!] Cerrando servidor Amoxcalli...")
        servidor.server_close()
        sys.exit(0)


if __name__ == "__main__":
    iniciar()
