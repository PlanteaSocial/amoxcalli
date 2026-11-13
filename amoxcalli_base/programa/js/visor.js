const params = new URLSearchParams(window.location.search);
const archivoLibro = params.get("libro") || "";
const formatoLibro = (
  params.get("formato") || (archivoLibro.toLowerCase().endsWith(".pdf") ? "PDF" : "EPUB")
).toUpperCase();

let colorNeonActivo = "yellow";
let estructuraEpub = null;
let capituloActualIndex = 0;
let paginaActualPdf = 1;
let totalPaginasPdf = 1;
let modoPdfOriginal = false;
let tituloObraActual = "";
let autorObraActual = "Acervo Comunitario";

let listaDivisores = [];
let listaSubrayados = [];

const STORAGE_KEY_PROGRESO = `progreso_${archivoLibro}`;
const STORAGE_KEY_DIVISORES = `divisores_${archivoLibro}`;
const STORAGE_KEY_SUBRAYADOS = `subrayados_${archivoLibro}`;

const SVG_TRASH = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
`;

const SVG_BOOKMARK_ICON = `
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
`;

document.addEventListener("DOMContentLoaded", () => {
  inicializarTemaYTipografia();
  inicializarVisor();
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mostrarToast(msg) {
  const t = document.getElementById("toast-visor");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window._visorToastTimer);
  window._visorToastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 2800);
}

function inicializarTemaYTipografia() {
  const temaGuardado = localStorage.getItem("biblioteca_tema") || "light";
  aplicarTemaVisor(temaGuardado, false);

  const fontSizeGuardado = parseInt(localStorage.getItem("biblioteca_fontsize") || "17", 10);
  aplicarTamanoLetra(fontSizeGuardado);

  const fontFamilyGuardada = localStorage.getItem("biblioteca_fontfamily") || "serif";
  aplicarFamiliaTipografica(fontFamilyGuardada);
}

function aplicarTemaVisor(tema, notificar = false) {
  const temaValido = ["light", "sepia", "dark"].includes(tema) ? tema : "light";
  document.documentElement.setAttribute("data-theme", temaValido);
  localStorage.setItem("biblioteca_tema", temaValido);

  document.querySelectorAll(".theme-swatch").forEach((sw) => {
    sw.classList.toggle("active", sw.getAttribute("data-swatch-theme") === temaValido);
  });

  if (notificar) {
    const nombres = { light: "Modo Claro", sepia: "Modo Códice Cálido", dark: "Modo Oscuro OLED" };
    mostrarToast(`${nombres[temaValido] || temaValido} activado`);
  }
}

function aplicarTamanoLetra(px) {
  const tamano = Math.max(13, Math.min(26, px));
  localStorage.setItem("biblioteca_fontsize", String(tamano));
  const lienzo = document.getElementById("reader-canvas");
  if (lienzo) {
    lienzo.style.fontSize = `${tamano}px`;
  }
}

function aplicarFamiliaTipografica(familia) {
  const esSans = familia === "sans";
  localStorage.setItem("biblioteca_fontfamily", esSans ? "sans" : "serif");
  const lienzo = document.getElementById("reader-canvas");
  if (lienzo) {
    lienzo.classList.toggle("font-sans", esSans);
  }
  const btnSerif = document.getElementById("btn-font-serif");
  const btnSans = document.getElementById("btn-font-sans");
  if (btnSerif) btnSerif.classList.toggle("active", !esSans);
  if (btnSans) btnSans.classList.toggle("active", esSans);
}

function inicializarVisor() {
  const nombreBase = archivoLibro.split("/").pop() || archivoLibro;
  tituloObraActual = nombreBase.replace(/_/g, " ").replace(/\.pdf|\.epub/i, "");
  document.getElementById("visor-titulo-libro").textContent = tituloObraActual;

  const btnDescargar = document.getElementById("btn-descargar-libro");
  if (btnDescargar) {
    btnDescargar.href = `/libros/${encodeURIComponent(archivoLibro)}`;
    btnDescargar.setAttribute("download", nombreBase);
  }

  cargarDatosGuardados();
  configurarPaletaNeon();
  configurarControlesHUD();
  configurarClicDirectoParaDesubrayar();

  if (formatoLibro === "PDF") {
    const btnModoPdf = document.getElementById("btn-modo-pdf-original");
    if (btnModoPdf) btnModoPdf.style.display = "inline-flex";
    const grupoSaltoPdf = document.getElementById("grupo-salto-pdf");
    if (grupoSaltoPdf) grupoSaltoPdf.style.display = "inline-flex";
    cargarLibroPdfWeb();
  } else {
    const selectSaltoEpub = document.getElementById("select-salto-epub");
    if (selectSaltoEpub) selectSaltoEpub.style.display = "inline-block";
    cargarLibroEpub();
  }
}

function cargarDatosGuardados() {
  const divRaw = localStorage.getItem(STORAGE_KEY_DIVISORES);
  if (divRaw) {
    try {
      listaDivisores = JSON.parse(divRaw);
    } catch (e) {
      listaDivisores = [];
    }
  }

  const subRaw = localStorage.getItem(STORAGE_KEY_SUBRAYADOS);
  if (subRaw) {
    try {
      listaSubrayados = JSON.parse(subRaw);
    } catch (e) {
      listaSubrayados = [];
    }
  }

  actualizarListaLateral();
}

function guardarProgreso(posicionNum) {
  const data = {
    archivo: archivoLibro,
    formato: formatoLibro,
    pagina: formatoLibro === "PDF" ? posicionNum : undefined,
    capitulo: formatoLibro === "EPUB" ? posicionNum : undefined,
    fecha: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY_PROGRESO, JSON.stringify(data));
}

function configurarPaletaNeon() {
  const dots = document.querySelectorAll(".neon-dot");
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      dots.forEach((d) => d.classList.remove("active"));
      dot.classList.add("active");
      colorNeonActivo = dot.getAttribute("data-color");
    });
  });
}

// ============================================================================
// 1. LECTURA DE PDF EN CANVAS WEB NATIVO + VISTA ORIGINAL
// ============================================================================
async function cargarLibroPdfWeb() {
  const lienzo = document.getElementById("reader-canvas");
  lienzo.innerHTML = `<div style="text-align: center; color: var(--text-tertiary); padding: 40px;">Cargando edición PDF...</div>`;

  try {
    const res = await fetch(`/api/pdf/info?archivo=${encodeURIComponent(archivoLibro)}`);
    if (res.ok) {
      const info = await res.json();
      totalPaginasPdf = info.num_paginas || 1;
      if (info.titulo) {
        tituloObraActual = info.titulo;
        document.getElementById("visor-titulo-libro").textContent = tituloObraActual;
      }
      if (info.autor) autorObraActual = info.autor;

      const labelTotal = document.getElementById("label-total-pdf");
      const inputSalto = document.getElementById("input-salto-pdf");
      if (labelTotal) labelTotal.textContent = `de ${totalPaginasPdf}`;
      if (inputSalto) inputSalto.max = String(totalPaginasPdf);

      const progreso = localStorage.getItem(STORAGE_KEY_PROGRESO);
      if (progreso) {
        try {
          const p = JSON.parse(progreso);
          paginaActualPdf = Math.max(1, Math.min(parseInt(p.pagina, 10) || 1, totalPaginasPdf));
        } catch (e) {
          paginaActualPdf = 1;
        }
      }

      renderizarPaginaPdf(paginaActualPdf);
    } else {
      lienzo.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
        No se pudo conectar con el servidor local para procesar el PDF.
      </div>`;
    }
  } catch (e) {
    lienzo.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
      Error de conexión al leer el PDF.
    </div>`;
  }
}

async function renderizarPaginaPdf(numPagina) {
  const lienzo = document.getElementById("reader-canvas");
  const indicador = document.getElementById("indicador-posicion");
  const inputSalto = document.getElementById("input-salto-pdf");
  const iframePdf = document.getElementById("iframe-pdf-nativo");

  paginaActualPdf = Math.max(1, Math.min(numPagina, totalPaginasPdf));
  const textoPos = `Página ${paginaActualPdf} de ${totalPaginasPdf}`;
  if (indicador) indicador.textContent = textoPos;
  if (inputSalto) inputSalto.value = String(paginaActualPdf);

  const btnPrev = document.getElementById("btn-nav-prev");
  const btnNext = document.getElementById("btn-nav-next");
  if (btnPrev) btnPrev.disabled = paginaActualPdf <= 1;
  if (btnNext) btnNext.disabled = paginaActualPdf >= totalPaginasPdf;

  if (modoPdfOriginal && iframePdf) {
    iframePdf.src = `/libros/${encodeURIComponent(archivoLibro)}#page=${paginaActualPdf}`;
  }

  lienzo.innerHTML = `<div style="text-align: center; color: var(--text-tertiary); padding: 40px;">Cargando página ${paginaActualPdf}...</div>`;

  try {
    const res = await fetch(
      `/api/pdf/pagina?archivo=${encodeURIComponent(archivoLibro)}&pagina=${paginaActualPdf}`
    );
    if (res.ok) {
      const htmlContenido = await res.text();
      lienzo.innerHTML = htmlContenido;
      aplicarSubrayadosGuardados(paginaActualPdf);
      guardarProgreso(paginaActualPdf);
      document.getElementById("contenedor-scroll").scrollTop = 0;
    } else {
      lienzo.innerHTML = `<p style="color: var(--text-tertiary);">No se pudo cargar la página ${paginaActualPdf}.</p>`;
    }
  } catch (e) {
    lienzo.innerHTML = `<p style="color: var(--text-tertiary);">Error de red al obtener la página.</p>`;
  }
}

function alternarModoPdfOriginal() {
  modoPdfOriginal = !modoPdfOriginal;
  const lienzo = document.getElementById("reader-canvas");
  const contNativo = document.getElementById("contenedor-pdf-nativo");
  const iframePdf = document.getElementById("iframe-pdf-nativo");
  const labelBtn = document.getElementById("label-modo-pdf");

  if (modoPdfOriginal) {
    lienzo.style.display = "none";
    contNativo.style.display = "block";
    iframePdf.src = `/libros/${encodeURIComponent(archivoLibro)}#page=${paginaActualPdf}`;
    if (labelBtn) labelBtn.textContent = "Texto Fluido";
    mostrarToast("Vista PDF Original activada");
  } else {
    contNativo.style.display = "none";
    lienzo.style.display = "block";
    if (labelBtn) labelBtn.textContent = "PDF Original";
    mostrarToast("Modo Texto Fluido activado");
  }
}

// ============================================================================
// 2. LECTURA DE LIBROS EPUB EN CANVAS WEB CON ÍNDICE DE CAPÍTULOS
// ============================================================================
async function cargarLibroEpub() {
  const lienzo = document.getElementById("reader-canvas");

  try {
    const res = await fetch(`/api/epub/info?archivo=${encodeURIComponent(archivoLibro)}`);
    if (res.ok) {
      estructuraEpub = await res.json();
      if (estructuraEpub.titulo) {
        tituloObraActual = estructuraEpub.titulo;
        document.getElementById("visor-titulo-libro").textContent = tituloObraActual;
      }
      if (estructuraEpub.autor) autorObraActual = estructuraEpub.autor;

      const selectSalto = document.getElementById("select-salto-epub");
      if (selectSalto && estructuraEpub.spine) {
        selectSalto.innerHTML = estructuraEpub.spine
          .map(
            (cap, idx) =>
              `<option value="${idx}">${idx + 1}. ${escapeHtml(cap.titulo || "Capítulo " + (idx + 1))}</option>`
          )
          .join("");
      }

      const progreso = localStorage.getItem(STORAGE_KEY_PROGRESO);
      if (progreso) {
        try {
          const p = JSON.parse(progreso);
          capituloActualIndex = parseInt(p.capitulo, 10) || 0;
        } catch (e) {
          capituloActualIndex = 0;
        }
      }

      if (!estructuraEpub.spine || capituloActualIndex >= estructuraEpub.spine.length) {
        capituloActualIndex = 0;
      }

      renderizarCapituloEpub(capituloActualIndex);
    } else {
      lienzo.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
        No se pudo cargar la estructura del EPUB.
      </div>`;
    }
  } catch (e) {
    lienzo.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
      Error de conexión al cargar el EPUB.
    </div>`;
  }
}

async function renderizarCapituloEpub(index) {
  const lienzo = document.getElementById("reader-canvas");
  const indicador = document.getElementById("indicador-posicion");
  const selectSalto = document.getElementById("select-salto-epub");

  if (!estructuraEpub || !estructuraEpub.spine || !estructuraEpub.spine[index]) return;

  capituloActualIndex = index;
  const itemSpine = estructuraEpub.spine[index];
  const nombreCap = itemSpine.titulo || `Capítulo ${index + 1}`;
  const textoPos = `Cap. ${index + 1} de ${estructuraEpub.spine.length} · ${nombreCap}`;
  if (indicador) indicador.textContent = textoPos;
  if (selectSalto) selectSalto.value = String(index);

  const btnPrev = document.getElementById("btn-nav-prev");
  const btnNext = document.getElementById("btn-nav-next");
  if (btnPrev) btnPrev.disabled = index <= 0;
  if (btnNext) btnNext.disabled = index >= estructuraEpub.spine.length - 1;

  lienzo.innerHTML = `<div style="text-align: center; color: var(--text-tertiary); padding: 40px;">Cargando capítulo...</div>`;

  try {
    const res = await fetch(
      `/api/epub/capitulo?archivo=${encodeURIComponent(archivoLibro)}&href=${encodeURIComponent(itemSpine.href)}`
    );
    if (res.ok) {
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const contenidoLimpio = doc.body ? doc.body.innerHTML : html;

      lienzo.innerHTML = contenidoLimpio;
      aplicarSubrayadosGuardados(index);
      guardarProgreso(index);
      document.getElementById("contenedor-scroll").scrollTop = 0;
    }
  } catch (e) {
    lienzo.innerHTML = `<p style="color: var(--text-tertiary);">Error al leer el capítulo.</p>`;
  }
}

// ============================================================================
// 3. CREAR Y BORRAR DIVISORES / MARCAPÁGINAS
// ============================================================================
function abrirModalDivisor() {
  const posActualTexto =
    formatoLibro === "PDF" ? `Página ${paginaActualPdf}` : `Capítulo ${capituloActualIndex + 1}`;
  const modal = document.getElementById("modal-divisor");
  const input = document.getElementById("input-nombre-divisor");
  const sub = document.getElementById("subtitulo-modal-divisor");

  if (sub) sub.textContent = `Guardar marcapáginas en ${posActualTexto}:`;
  if (input) input.value = `Sección clave en ${posActualTexto}`;
  if (modal) {
    modal.style.display = "flex";
    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 60);
  }
}

function cerrarModalDivisor() {
  const modal = document.getElementById("modal-divisor");
  if (modal) modal.style.display = "none";
}

function confirmarCrearDivisor() {
  const input = document.getElementById("input-nombre-divisor");
  const etiqueta = input ? input.value.trim() : "";
  if (!etiqueta) return;

  const posActualTexto =
    formatoLibro === "PDF" ? `Página ${paginaActualPdf}` : `Capítulo ${capituloActualIndex + 1}`;
  const posIndex = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;

  const nuevoDivisor = {
    id: Date.now(),
    etiqueta: etiqueta,
    posicion: posActualTexto,
    indice: posIndex,
    formato: formatoLibro,
    fecha: new Date().toLocaleDateString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };

  listaDivisores.push(nuevoDivisor);
  localStorage.setItem(STORAGE_KEY_DIVISORES, JSON.stringify(listaDivisores));
  actualizarListaLateral();
  cerrarModalDivisor();
  mostrarToast(`Divisor guardado en ${posActualTexto}`);
}

function eliminarDivisor(id, event) {
  if (event) event.stopPropagation();
  listaDivisores = listaDivisores.filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY_DIVISORES, JSON.stringify(listaDivisores));
  actualizarListaLateral();
  mostrarToast("Divisor eliminado");
}

// ============================================================================
// 4. SUBRAYADO Y DESUBRAYADO INTERACTIVO (3 VÍAS DE DESUBRAYADO)
// ============================================================================
function subrayarTextoSeleccionado() {
  const seleccion = window.getSelection();
  const texto = seleccion ? seleccion.toString().trim() : "";

  if (!texto) {
    mostrarToast("Selecciona primero una frase del texto con el cursor o tu dedo");
    return;
  }

  const idNuevo = Date.now();
  const claseNeon = `hl-neon-${colorNeonActivo}`;
  try {
    const range = seleccion.getRangeAt(0);
    const mark = document.createElement("mark");
    mark.className = claseNeon;
    mark.setAttribute("data-hl-id", String(idNuevo));
    mark.setAttribute("title", "Clic para quitar subrayado");
    mark.textContent = texto;
    range.deleteContents();
    range.insertNode(mark);
  } catch (e) {}

  const posId = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;

  const nuevoSubrayado = {
    id: idNuevo,
    texto: texto,
    color: colorNeonActivo,
    posicionId: posId,
    posicionTexto: formatoLibro === "PDF" ? `Pág. ${paginaActualPdf}` : `Cap. ${capituloActualIndex + 1}`,
    fecha: new Date().toLocaleDateString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };

  listaSubrayados.push(nuevoSubrayado);
  localStorage.setItem(STORAGE_KEY_SUBRAYADOS, JSON.stringify(listaSubrayados));
  actualizarListaLateral();
  seleccion.removeAllRanges();
  mostrarToast("Texto subrayado (haz clic sobre él cuando quieras desubrayarlo)");
}

/**
 * Vía 1: Clic directo sobre cualquier <mark> en la hoja para desubrayarlo al instante.
 */
function configurarClicDirectoParaDesubrayar() {
  const lienzo = document.getElementById("reader-canvas");
  if (!lienzo) return;

  lienzo.addEventListener("click", (e) => {
    // Si el usuario está seleccionando texto activamente, no borrar por accidente
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;

    const markEl = e.target.closest("mark[class*='hl-neon-']");
    if (!markEl) return;

    desubrayarNodoMark(markEl);
  });
}

function desubrayarNodoMark(markEl) {
  const idAttr = markEl.getAttribute("data-hl-id");
  const textoMark = (markEl.textContent || "").trim();
  const posId = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;

  // Reemplazar <mark> por nodo de texto limpio sin recargar la página
  const textNode = document.createTextNode(markEl.textContent);
  markEl.replaceWith(textNode);

  // Eliminar de listaSubrayados por ID o por coincidencia de texto en esta página
  if (idAttr) {
    const idNum = parseInt(idAttr, 10);
    listaSubrayados = listaSubrayados.filter((s) => s.id !== idNum);
  } else {
    let eliminado = false;
    listaSubrayados = listaSubrayados.filter((s) => {
      if (!eliminado && s.posicionId === posId && s.texto.trim() === textoMark) {
        eliminado = true;
        return false;
      }
      return true;
    });
  }

  localStorage.setItem(STORAGE_KEY_SUBRAYADOS, JSON.stringify(listaSubrayados));
  actualizarListaLateral();
  mostrarToast("Subrayado eliminado");
}

/**
 * Vía 2: Botón "Desubrayar" en la barra superior.
 * - Si hay texto seleccionado que contiene o toca algún <mark>, lo desubraya.
 * - Si no hay selección, desubraya el último subrayado hecho en la página/capítulo actual.
 */
function desubrayarSeleccionOUltimo() {
  const lienzo = document.getElementById("reader-canvas");
  if (!lienzo) return;

  const sel = window.getSelection();
  const textoSel = sel ? sel.toString().trim() : "";

  if (textoSel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const marksEnLienzo = Array.from(lienzo.querySelectorAll("mark[class*='hl-neon-']"));
    const marksTocadas = marksEnLienzo.filter((m) => {
      try {
        return range.intersectsNode(m) || m.textContent.includes(textoSel) || textoSel.includes(m.textContent);
      } catch (e) {
        return false;
      }
    });

    if (marksTocadas.length > 0) {
      marksTocadas.forEach((m) => desubrayarNodoMark(m));
      sel.removeAllRanges();
      return;
    }
  }

  // Si no hay selección activa, quitar el último subrayado de la página actual
  const marksPagina = Array.from(lienzo.querySelectorAll("mark[class*='hl-neon-']"));
  if (marksPagina.length > 0) {
    const ultimoMark = marksPagina[marksPagina.length - 1];
    desubrayarNodoMark(ultimoMark);
  } else {
    mostrarToast("No hay subrayados en esta página para quitar");
  }
}

/**
 * Vía 3: Eliminar desde el icono de papelera en la barra lateral.
 */
function eliminarSubrayado(id, event) {
  if (event) event.stopPropagation();
  const lienzo = document.getElementById("reader-canvas");
  if (lienzo) {
    const markDom = lienzo.querySelector(`mark[data-hl-id="${id}"]`);
    if (markDom) {
      markDom.replaceWith(document.createTextNode(markDom.textContent));
    }
  }

  listaSubrayados = listaSubrayados.filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY_SUBRAYADOS, JSON.stringify(listaSubrayados));
  actualizarListaLateral();
  mostrarToast("Subrayado eliminado");
}

function aplicarSubrayadosGuardados(posId) {
  const lienzo = document.getElementById("reader-canvas");
  if (!lienzo) return;

  const subrayadosPos = listaSubrayados.filter((s) => s.posicionId === posId);
  if (subrayadosPos.length === 0) return;

  let html = lienzo.innerHTML;
  subrayadosPos.forEach((s) => {
    if (s.texto && html.includes(s.texto)) {
      const clase = `hl-neon-${s.color}`;
      html = html.replace(
        s.texto,
        `<mark class="${clase}" data-hl-id="${s.id}" title="Clic para quitar subrayado">${s.texto}</mark>`
      );
    }
  });
  lienzo.innerHTML = html;
}

function exportarApuntesTxt() {
  if (listaDivisores.length === 0 && listaSubrayados.length === 0) {
    mostrarToast("Aún no tienes divisores ni citas subrayadas en esta obra");
    return;
  }

  const etiquetasColor = {
    yellow: "IDEA PRINCIPAL",
    green: "DATO / EVIDENCIA",
    pink: "DUDA / DEBATE",
  };

  let lineas = [];
  lineas.push("======================================================================");
  lineas.push(`APUNTES DE LECTURA — AMOXCALLI LIBRE (INICIATIVA PLANTEA)`);
  lineas.push("======================================================================");
  lineas.push(`Obra  : ${tituloObraActual}`);
  lineas.push(`Autor : ${autorObraActual}`);
  lineas.push(`Fecha : ${new Date().toLocaleDateString("es-MX")}`);
  lineas.push("----------------------------------------------------------------------\n");

  if (listaDivisores.length > 0) {
    lineas.push("MIS DIVISORES / MARCAPÁGINAS:");
    listaDivisores.forEach((d, idx) => {
      lineas.push(`  ${idx + 1}. [${d.posicion}] ${d.etiqueta} (${d.fecha})`);
    });
    lineas.push("");
  }

  if (listaSubrayados.length > 0) {
    lineas.push("MIS CITAS SUBRAYADAS:");
    listaSubrayados.forEach((s, idx) => {
      const tipo = etiquetasColor[s.color] || "SUBRAYADO";
      lineas.push(`  ${idx + 1}. [${s.posicionTexto} · ${tipo}]`);
      lineas.push(`     "${s.texto}"\n`);
    });
  }

  const blob = new Blob([lineas.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nombreLimpio = tituloObraActual
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_\- ]/g, "")
    .replace(/\s+/g, "_");
  a.href = url;
  a.download = `Apuntes_${nombreLimpio || "Amoxcalli"}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  mostrarToast("Apuntes descargados en archivo .txt");
}

// ============================================================================
// 5. BARRA LATERAL Y SALTOS RÁPIDOS
// ============================================================================
function actualizarListaLateral() {
  const contDivisores = document.getElementById("lista-divisores-sidebar");
  const contSubrayados = document.getElementById("lista-subrayados-sidebar");

  if (contDivisores) {
    if (listaDivisores.length === 0) {
      contDivisores.innerHTML = `<p style="font-size: 12px; color: var(--text-tertiary);">No has creado divisores aún.</p>`;
    } else {
      contDivisores.innerHTML = listaDivisores
        .map(
          (d) => `
        <div class="annotation-item" onclick="saltarADivisor(${d.indice})">
          <div class="annotation-meta">
            <span style="display: inline-flex; align-items: center; gap: 5px;">
              ${SVG_BOOKMARK_ICON}
              <span>${escapeHtml(d.posicion)} · ${escapeHtml(d.fecha)}</span>
            </span>
            <button class="btn-delete-ann" onclick="eliminarDivisor(${d.id}, event)" title="Eliminar divisor">
              ${SVG_TRASH}
            </button>
          </div>
          <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(d.etiqueta)}</div>
        </div>
      `
        )
        .join("");
    }
  }

  if (contSubrayados) {
    if (listaSubrayados.length === 0) {
      contSubrayados.innerHTML = `<p style="font-size: 12px; color: var(--text-tertiary);">Selecciona cualquier texto y pulsa «Subrayar».</p>`;
    } else {
      contSubrayados.innerHTML = listaSubrayados
        .map((s) => {
          const colorPunto =
            s.color === "yellow"
              ? "var(--neon-yellow)"
              : s.color === "green"
              ? "var(--neon-green)"
              : "var(--neon-pink)";
          return `
          <div class="annotation-item" onclick="saltarADivisor(${s.posicionId})">
            <div class="annotation-meta">
              <span style="display: inline-flex; align-items: center; gap: 6px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${colorPunto}; display: inline-block;"></span>
                <span>${escapeHtml(s.posicionTexto)} · ${escapeHtml(s.fecha)}</span>
              </span>
              <button class="btn-delete-ann" onclick="eliminarSubrayado(${s.id}, event)" title="Quitar subrayado">
                ${SVG_TRASH}
              </button>
            </div>
            <div class="annotation-text">"${escapeHtml(s.texto)}"</div>
          </div>
        `;
        })
        .join("");
    }
  }
}

function saltarADivisor(indice) {
  if (formatoLibro === "PDF") {
    paginaActualPdf = indice;
    renderizarPaginaPdf(paginaActualPdf);
  } else {
    capituloActualIndex = indice;
    renderizarCapituloEpub(capituloActualIndex);
  }
}

// ============================================================================
// 6. CONTROLES DEL HUD Y NAVEGACIÓN
// ============================================================================
function configurarControlesHUD() {
  document.getElementById("btn-crear-divisor").addEventListener("click", abrirModalDivisor);
  document.getElementById("btn-cerrar-modal-divisor").addEventListener("click", cerrarModalDivisor);
  document.getElementById("btn-cancelar-divisor").addEventListener("click", cerrarModalDivisor);
  document.getElementById("btn-guardar-divisor").addEventListener("click", confirmarCrearDivisor);

  const inputNombreDiv = document.getElementById("input-nombre-divisor");
  if (inputNombreDiv) {
    inputNombreDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmarCrearDivisor();
      if (e.key === "Escape") cerrarModalDivisor();
    });
  }

  document.getElementById("btn-subrayar-neon").addEventListener("click", subrayarTextoSeleccionado);
  document.getElementById("btn-desubrayar").addEventListener("click", desubrayarSeleccionOUltimo);
  document.getElementById("btn-exportar-apuntes").addEventListener("click", exportarApuntesTxt);

  const btnModoPdf = document.getElementById("btn-modo-pdf-original");
  if (btnModoPdf) {
    btnModoPdf.addEventListener("click", alternarModoPdfOriginal);
  }

  // Popover de Apariencia (Aa)
  const btnApariencia = document.getElementById("btn-apariencia");
  const popoverApariencia = document.getElementById("popover-apariencia");
  if (btnApariencia && popoverApariencia) {
    btnApariencia.addEventListener("click", (e) => {
      e.stopPropagation();
      popoverApariencia.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!popoverApariencia.contains(e.target) && e.target !== btnApariencia) {
        popoverApariencia.classList.remove("open");
      }
    });
  }

  // Controles de tamaño y fuente dentro de Aa
  document.getElementById("btn-font-down").addEventListener("click", () => {
    const actual = parseInt(localStorage.getItem("biblioteca_fontsize") || "17", 10);
    aplicarTamanoLetra(actual - 1);
  });
  document.getElementById("btn-font-up").addEventListener("click", () => {
    const actual = parseInt(localStorage.getItem("biblioteca_fontsize") || "17", 10);
    aplicarTamanoLetra(actual + 1);
  });

  document.getElementById("btn-font-serif").addEventListener("click", () => aplicarFamiliaTipografica("serif"));
  document.getElementById("btn-font-sans").addEventListener("click", () => aplicarFamiliaTipografica("sans"));

  document.querySelectorAll(".theme-swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      aplicarTemaVisor(sw.getAttribute("data-swatch-theme"), true);
    });
  });

  // Salto directo en EPUB y PDF
  const selectSaltoEpub = document.getElementById("select-salto-epub");
  if (selectSaltoEpub) {
    selectSaltoEpub.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx)) renderizarCapituloEpub(idx);
    });
  }

  const inputSaltoPdf = document.getElementById("input-salto-pdf");
  if (inputSaltoPdf) {
    inputSaltoPdf.addEventListener("change", (e) => {
      const pag = parseInt(e.target.value, 10);
      if (!isNaN(pag)) renderizarPaginaPdf(pag);
    });
  }

  const btnSidebar = document.getElementById("btn-toggle-sidebar");
  const sidebar = document.getElementById("sidebar-anotaciones");
  btnSidebar.addEventListener("click", () => {
    sidebar.classList.toggle("hidden");
  });

  const btnCerrarSidebar = document.getElementById("btn-cerrar-sidebar");
  if (btnCerrarSidebar) {
    btnCerrarSidebar.addEventListener("click", () => {
      sidebar.classList.add("hidden");
    });
  }

  const btnPrev = document.getElementById("btn-nav-prev");
  const btnNext = document.getElementById("btn-nav-next");

  const irAnterior = () => {
    if (formatoLibro === "PDF") {
      if (paginaActualPdf > 1) {
        paginaActualPdf--;
        renderizarPaginaPdf(paginaActualPdf);
      }
    } else {
      if (capituloActualIndex > 0) {
        capituloActualIndex--;
        renderizarCapituloEpub(capituloActualIndex);
      }
    }
  };

  const irSiguiente = () => {
    if (formatoLibro === "PDF") {
      if (paginaActualPdf < totalPaginasPdf) {
        paginaActualPdf++;
        renderizarPaginaPdf(paginaActualPdf);
      }
    } else {
      if (estructuraEpub && capituloActualIndex < estructuraEpub.spine.length - 1) {
        capituloActualIndex++;
        renderizarCapituloEpub(capituloActualIndex);
      }
    }
  };

  btnPrev.addEventListener("click", irAnterior);
  btnNext.addEventListener("click", irSiguiente);

  document.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key === "ArrowLeft") irAnterior();
    if (e.key === "ArrowRight") irSiguiente();
  });
}
