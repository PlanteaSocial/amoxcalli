let catalogoLibros = [];
let librosFiltrados = [];
let filtroFormato = "todos";
let coleccionActiva = "todas";
let ordenActual = "coleccion";
let urlLanActiva = "";

const TEMAS_CICLO = ["light", "sepia", "dark"];
const ETIQUETAS_TEMA = {
  light: "Claro",
  sepia: "Códice",
  dark: "Oscuro",
};

const SVG_SUN = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
`;

const SVG_CODEX = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
`;

const SVG_MOON = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
`;

const SVG_CHEVRON_RIGHT = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
`;

const SVG_DOWNLOAD = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
`;

const SVG_BOOKMARK_MINI = `
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
`;

const SVG_LIBRARY_EMPTY = `
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
  </svg>
`;

const SVG_PACKAGE = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
`;

const SVG_FILE_TEXT = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
`;

const SVG_IMAGE = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
`;

const SVG_TRASH = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
`;

const SVG_SPINNER = `
  <svg class="amox-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
  </svg>
`;

document.addEventListener("DOMContentLoaded", () => {
  inicializarTema();
  cargarInformacionRed();
  cargarCatalogo();
  configurarEventos();
  configurarModuloAdministracion();
});

function normalizarTexto(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mostrarToast(mensaje) {
  const t = document.getElementById("toast-global");
  if (!t) return;
  t.textContent = mensaje;
  t.style.display = "block";
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 3000);
}

function inicializarTema() {
  const temaGuardado = localStorage.getItem("biblioteca_tema") || localStorage.getItem("celer_theme") || "light";
  aplicarTema(temaGuardado);
}

function aplicarTema(tema) {
  const temaValido = TEMAS_CICLO.includes(tema) ? tema : "light";
  document.documentElement.setAttribute("data-theme", temaValido);
  localStorage.setItem("biblioteca_tema", temaValido);

  const iconoEl = document.getElementById("icono-tema-home");
  const textoEl = document.getElementById("texto-tema-home");
  if (iconoEl) {
    iconoEl.innerHTML =
      temaValido === "dark" ? SVG_MOON : temaValido === "sepia" ? SVG_CODEX : SVG_SUN;
  }
  if (textoEl) {
    textoEl.textContent = ETIQUETAS_TEMA[temaValido] || "Claro";
  }
}

function obtenerColorLomo(coleccion) {
  const c = normalizarTexto(coleccion);
  if (c.includes("literatura") || c.includes("narrativa") || c.includes("cuento")) return "#d97706";
  if (c.includes("historia") || c.includes("cultura")) return "#ff3b30";
  if (c.includes("ciencia") || c.includes("naturaleza")) return "#34c759";
  if (c.includes("pensamiento") || c.includes("filosof") || c.includes("lectura")) return "#5e5ce6";
  if (c.includes("guia") || c.includes("manual")) return "#0071e3";
  return "#0071e3";
}

function obtenerSubtituloSala(coleccion) {
  const c = normalizarTexto(coleccion);
  if (c.includes("literatura") || c.includes("narrativa")) {
    return "Obras narrativas, novelas clásicas, cuentos y letras universales.";
  }
  if (c.includes("historia") || c.includes("cultura")) {
    return "Crónicas históricas, memoria de los pueblos y patrimonio cultural.";
  }
  if (c.includes("ciencia") || c.includes("naturaleza")) {
    return "Divulgación científica, exploración de la naturaleza y matemáticas.";
  }
  if (c.includes("pensamiento") || c.includes("filosof") || c.includes("lectura")) {
    return "Ensayos, pensamiento crítico, filosofía y formación lectora.";
  }
  if (c.includes("guia") || c.includes("manual")) {
    return "Manuales operativos, guías técnicas y recursos para el aula.";
  }
  return "Obras completas disponibles para lectura y estudio en red local.";
}

async function cargarInformacionRed() {
  const lanIpElement = document.getElementById("lan-ip-display");
  const modalUrlElement = document.getElementById("modal-lan-url");
  const btnAdmin = document.getElementById("btn-admin-acervo");

  try {
    const res = await fetch("/api/info");
    if (res.ok) {
      const info = await res.json();
      urlLanActiva = info.url_lan;
      if (lanIpElement) lanIpElement.textContent = info.url_lan.replace(/^https?:\/\//, "");
      if (modalUrlElement) modalUrlElement.textContent = info.url_lan;
      actualizarQrLan(info.url_lan);

      // Comprobar si este cliente es el anfitrión (computadora del profesor en localhost)
      const esLocal = (info && info.es_anfitrion) ||
        ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
      if (btnAdmin && esLocal) {
        btnAdmin.style.display = "inline-flex";
      }
    }
  } catch (e) {
    if (lanIpElement) lanIpElement.textContent = "Aula Local";
    const esLocal = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (btnAdmin && esLocal) {
      btnAdmin.style.display = "inline-flex";
    }
  }
}

function actualizarQrLan(url) {
  const qrContainer = document.getElementById("modal-lan-qr");
  if (!qrContainer || typeof QRCode === "undefined") return;

  const textoUrl = url || urlLanActiva || window.location.origin;
  if (!textoUrl) return;

  qrContainer.innerHTML = "";
  try {
    new QRCode(qrContainer, {
      text: textoUrl,
      width: 140,
      height: 140,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (err) {
    console.error("Error al generar código QR:", err);
  }
}

async function cargarCatalogo() {
  try {
    const res = await fetch("/api/libros");
    if (res.ok) {
      catalogoLibros = await res.json();
    } else {
      catalogoLibros = obtenerCatalogoOffline();
    }
  } catch (e) {
    catalogoLibros = obtenerCatalogoOffline();
  }

  renderizarBarraColecciones();
  renderizarEstanteContinuar();
  aplicarFiltrosYOrden();
}

function obtenerCatalogoOffline() {
  return [];
}

function obtenerProgresoLibro(archivo) {
  const raw = localStorage.getItem(`progreso_${archivo}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function renderizarBarraColecciones() {
  const barra = document.getElementById("barra-colecciones");
  if (!barra) return;

  const conteoPorColeccion = {};
  catalogoLibros.forEach((l) => {
    const col = l.coleccion || "Acervo General";
    conteoPorColeccion[col] = (conteoPorColeccion[col] || 0) + 1;
  });

  const colecciones = Object.keys(conteoPorColeccion).sort((a, b) => a.localeCompare(b, "es"));

  let html = `
    <button class="cat-pill ${coleccionActiva === "todas" ? "active" : ""}" data-coleccion="todas">
      <span>Todas las colecciones (${catalogoLibros.length})</span>
    </button>
  `;

  colecciones.forEach((col) => {
    const activo = coleccionActiva === col ? "active" : "";
    html += `
      <button class="cat-pill ${activo}" data-coleccion="${escapeHtml(col)}">
        <span>${escapeHtml(col)} (${conteoPorColeccion[col]})</span>
      </button>
    `;
  });

  barra.innerHTML = html;

  barra.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      coleccionActiva = btn.getAttribute("data-coleccion");
      barra.querySelectorAll(".cat-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      aplicarFiltrosYOrden();
    });
  });
}

function construirTarjetaLibroHtml(libro) {
  const prog = obtenerProgresoLibro(libro.archivo);
  const spineColor = obtenerColorLomo(libro.coleccion);
  const unidadPaginas = libro.formato === "PDF" ? "págs." : "capítulos";
  const infoExtension = libro.paginas ? `${libro.paginas} ${unidadPaginas}` : libro.tamano;

  let progresoHtml = "";
  if (prog) {
    const posLabel =
      libro.formato === "PDF"
        ? `Pág. ${prog.pagina || 1} guardada`
        : `Cap. ${(prog.capitulo || 0) + 1} guardado`;
    progresoHtml = `
      <div class="reading-progress-pill">
        ${SVG_BOOKMARK_MINI}
        <span>${posLabel}</span>
      </div>
    `;
  }

  const urlVisor = `visor.html?libro=${encodeURIComponent(libro.archivo)}&formato=${libro.formato}`;
  const portadaSrc = libro.portada_url || `/api/libro/portada?archivo=${encodeURIComponent(libro.archivo)}`;

  return `
    <article class="book-card" style="--spine-color: ${spineColor};">
      <a href="${urlVisor}" class="book-card-main-link">
        <div class="book-cover-wrap">
          <img
            src="${portadaSrc}"
            class="book-cover-img"
            alt="${escapeHtml(libro.titulo)}"
            loading="lazy"
            onload="this.classList.add('loaded'); const fb = this.parentElement.querySelector('.book-cover-fallback'); if(fb) fb.style.display='none';"
            onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.book-cover-fallback'); if(fb) fb.style.display='flex';"
          />
          <div class="book-cover-fallback" style="--fallback-accent: ${spineColor};">
            <div class="fallback-frame">
              <div class="fallback-kicker">${escapeHtml(libro.formato)} · ${escapeHtml(libro.coleccion || "Acervo")}</div>
              <div class="fallback-title">${escapeHtml(libro.titulo)}</div>
              <div class="fallback-author">${escapeHtml(libro.autor)}</div>
              <div class="fallback-ornament">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
              </div>
            </div>
          </div>
          <div class="book-spine-crease"></div>
        </div>

        <div class="book-info-wrap">
          <div class="book-badge-row">
            <span class="book-code-badge">${escapeHtml(libro.formato)} · ${escapeHtml(libro.coleccion || "Acervo")}</span>
            <span class="book-open-arrow">${SVG_CHEVRON_RIGHT}</span>
          </div>
          <h3 class="book-title" title="${escapeHtml(libro.titulo)}">${escapeHtml(libro.titulo)}</h3>
          <p class="book-author">${escapeHtml(libro.autor)}</p>
          ${progresoHtml}
        </div>
      </a>
      <div class="book-card-footer">
        <span>${escapeHtml(infoExtension)}</span>
        <a href="/libros/${encodeURIComponent(libro.archivo)}" download class="card-download-link" title="Descargar archivo original">
          ${SVG_DOWNLOAD}
          <span>Guardar</span>
        </a>
      </div>
    </article>
  `;
}

function renderizarEstanteContinuar() {
  const seccion = document.getElementById("seccion-continuar");
  const contenedor = document.getElementById("contenedor-continuar");
  if (!seccion || !contenedor) return;

  const enProgreso = [];
  catalogoLibros.forEach((libro) => {
    const prog = obtenerProgresoLibro(libro.archivo);
    if (prog) enProgreso.push({ libro, prog });
  });

  enProgreso.sort((a, b) => {
    const fa = a.prog.fecha ? new Date(a.prog.fecha).getTime() : 0;
    const fb = b.prog.fecha ? new Date(b.prog.fecha).getTime() : 0;
    return fb - fa;
  });

  if (enProgreso.length === 0) {
    seccion.classList.remove("visible");
    return;
  }

  seccion.classList.add("visible");
  contenedor.innerHTML = enProgreso
    .slice(0, 4)
    .map(({ libro }) => construirTarjetaLibroHtml(libro))
    .join("");
}

function aplicarFiltrosYOrden() {
  const inputBusqueda = document.getElementById("input-busqueda");
  const term = normalizarTexto(inputBusqueda ? inputBusqueda.value : "");

  librosFiltrados = catalogoLibros.filter((libro) => {
    const prog = obtenerProgresoLibro(libro.archivo);

    const coincideFormato =
      filtroFormato === "todos" ||
      (filtroFormato === "leyendo" && prog !== null) ||
      libro.formato.toLowerCase() === filtroFormato.toLowerCase();

    const coincideColeccion =
      coleccionActiva === "todas" || (libro.coleccion || "Acervo General") === coleccionActiva;

    const textoIndexado = normalizarTexto(
      `${libro.titulo} ${libro.autor} ${libro.coleccion || ""} ${libro.archivo}`
    );
    const coincideTexto = term === "" || textoIndexado.includes(term);

    return coincideFormato && coincideColeccion && coincideTexto;
  });

  renderizarLibros();
}

function renderizarLibros() {
  const contenedor = document.getElementById("contenedor-libros");
  const contador = document.getElementById("contador-libros");

  if (!contenedor) return;

  if (contador) {
    contador.textContent = `${librosFiltrados.length} de ${catalogoLibros.length} ${
      catalogoLibros.length === 1 ? "obra" : "obras"
    }`;
  }

  if (librosFiltrados.length === 0) {
    if (catalogoLibros.length === 0) {
      contenedor.innerHTML = `
        <div class="empty-library-state">
          <div class="empty-library-icon">${SVG_LIBRARY_EMPTY}</div>
          <h2 class="empty-library-title">Tu biblioteca Amoxcalli Base está lista</h2>
          <p class="empty-library-desc">
            Aún no has integrado libros ni paquetes temáticos al acervo local.
          </p>
          <div class="empty-library-guide">
            <strong>¿Cómo agregar tus libros o paquetes?</strong>
            <ol>
              <li>Usa el botón <strong>Agregar Obras</strong> (arriba a la derecha) para subir paquetes <code>.zip</code> o libros individuales (<code>.epub</code> / <code>.pdf</code>) con solo arrastrarlos.</li>
              <li>O copia tus carpetas y archivos manualmente dentro de:<br>
                  <code class="empty-library-code">programa/libros/</code> y recarga (<strong>F5</strong>).</li>
            </ol>
            <div class="empty-library-cta">
              <button id="btn-empty-admin-trigger" class="sf-btn primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Subir Paquete o Libro desde Aquí</span>
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      contenedor.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-tertiary);">
          No se encontraron obras que coincidan con tu búsqueda.
        </div>
      `;
    }
    return;
  }

  // Si está en vista por Estanterías (coleccion) y no se forzó un orden plano
  if (ordenActual === "coleccion" && coleccionActiva === "todas") {
    const grupos = {};
    librosFiltrados.forEach((l) => {
      const sala = l.coleccion || "Acervo General";
      if (!grupos[sala]) grupos[sala] = [];
      grupos[sala].push(l);
    });

    const nombresSalas = Object.keys(grupos).sort((a, b) => a.localeCompare(b, "es"));

    contenedor.innerHTML = nombresSalas
      .map((sala) => {
        const obrasSala = grupos[sala].sort((a, b) =>
          (a.titulo || "").localeCompare(b.titulo || "", "es")
        );
        const cardsHtml = obrasSala.map((b) => construirTarjetaLibroHtml(b)).join("");
        return `
          <section class="shelf-section">
            <div class="shelf-header">
              <div>
                <h2 class="shelf-title">${escapeHtml(sala)}</h2>
                <p class="shelf-subtitle">${escapeHtml(obtenerSubtituloSala(sala))}</p>
              </div>
              <span class="shelf-count">${obrasSala.length} ${obrasSala.length === 1 ? "libro" : "libros"}</span>
            </div>
            <div class="books-grid">
              ${cardsHtml}
            </div>
          </section>
        `;
      })
      .join("");
    return;
  }

  // Vista ordenada plana (Título, Autor o Leídos recientemente)
  const listaOrdenada = [...librosFiltrados].sort((a, b) => {
    if (ordenActual === "autor") {
      return (a.autor || "").localeCompare(b.autor || "", "es");
    }
    if (ordenActual === "recientes") {
      const pa = obtenerProgresoLibro(a.archivo);
      const pb = obtenerProgresoLibro(b.archivo);
      const fa = pa && pa.fecha ? new Date(pa.fecha).getTime() : 0;
      const fb = pb && pb.fecha ? new Date(pb.fecha).getTime() : 0;
      if (fb !== fa) return fb - fa;
    }
    return (a.titulo || "").localeCompare(b.titulo || "", "es");
  });

  const tituloEncabezado =
    coleccionActiva !== "todas" ? coleccionActiva : "Catálogo General";

  contenedor.innerHTML = `
    <section class="shelf-section">
      <div class="shelf-header">
        <div>
          <h2 class="shelf-title">${escapeHtml(tituloEncabezado)}</h2>
          <p class="shelf-subtitle">${escapeHtml(obtenerSubtituloSala(tituloEncabezado))}</p>
        </div>
        <span class="shelf-count">${listaOrdenada.length} ${listaOrdenada.length === 1 ? "libro" : "libros"}</span>
      </div>
      <div class="books-grid">
        ${listaOrdenada.map((b) => construirTarjetaLibroHtml(b)).join("")}
      </div>
    </section>
  `;
}

function configurarEventos() {
  const inputBusqueda = document.getElementById("input-busqueda");
  const btnLimpiar = document.getElementById("btn-limpiar-busqueda");

  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", (e) => {
      if (btnLimpiar) {
        btnLimpiar.style.display = e.target.value ? "inline-flex" : "none";
      }
      aplicarFiltrosYOrden();
    });
  }

  if (btnLimpiar && inputBusqueda) {
    btnLimpiar.addEventListener("click", () => {
      inputBusqueda.value = "";
      btnLimpiar.style.display = "none";
      aplicarFiltrosYOrden();
      inputBusqueda.focus();
    });
  }

  const selectOrden = document.getElementById("select-orden");
  if (selectOrden) {
    selectOrden.addEventListener("change", (e) => {
      ordenActual = e.target.value;
      aplicarFiltrosYOrden();
    });
  }

  document.querySelectorAll(".fmt-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".fmt-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      filtroFormato = btn.getAttribute("data-filter");
      aplicarFiltrosYOrden();
    });
  });

  const btnTemaHome = document.getElementById("btn-ciclar-tema-home");
  if (btnTemaHome) {
    btnTemaHome.addEventListener("click", () => {
      const actual = document.documentElement.getAttribute("data-theme") || "light";
      const idx = TEMAS_CICLO.indexOf(actual);
      const siguiente = TEMAS_CICLO[(idx + 1) % TEMAS_CICLO.length];
      aplicarTema(siguiente);
      mostrarToast(`Ambiente ${ETIQUETAS_TEMA[siguiente]} activado`);
    });
  }

  const btnCompartir = document.getElementById("btn-compartir-lan");
  const modal = document.getElementById("modal-compartir");
  const modalClose = document.getElementById("modal-close");
  const btnCopiar = document.getElementById("btn-copiar-url");

  if (btnCompartir && modal) {
    btnCompartir.addEventListener("click", () => {
      modal.style.display = "flex";
      actualizarQrLan(urlLanActiva || window.location.origin);
    });
  }
  if (modalClose && modal) {
    modalClose.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }
  if (btnCopiar) {
    btnCopiar.addEventListener("click", () => {
      const textoUrl = urlLanActiva || window.location.origin;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textoUrl).then(() => {
          mostrarToast("Dirección copiada: " + textoUrl);
        });
      } else {
        mostrarToast("Dirección: " + textoUrl);
      }
    });
  }
}

function configurarModuloAdministracion() {
  const btnAbrir = document.getElementById("btn-admin-acervo");
  const modal = document.getElementById("modal-admin-acervo");
  const btnCerrar = document.getElementById("modal-admin-close");
  const statusBox = document.getElementById("admin-status-box");

  if (!modal) return;

  function mostrarModalAdmin() {
    modal.style.display = "flex";
    poblarSelectorSalas();
    renderizarGestionSalas();
  }

  function ocultarModalAdmin() {
    modal.style.display = "none";
    if (statusBox) statusBox.style.display = "none";
  }

  if (btnAbrir) {
    btnAbrir.addEventListener("click", mostrarModalAdmin);
  }

  if (btnCerrar) {
    btnCerrar.addEventListener("click", ocultarModalAdmin);
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) ocultarModalAdmin();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      ocultarModalAdmin();
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target && e.target.closest("#btn-empty-admin-trigger")) {
      mostrarModalAdmin();
    }
  });

  const tabs = modal.querySelectorAll(".admin-tab");
  const panes = modal.querySelectorAll(".admin-tab-pane");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panes.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");
      if (statusBox) statusBox.style.display = "none";

      if (targetId === "tab-gestionar") {
        renderizarGestionSalas();
      }
    });
  });

  function setStatus(msg, tipo = "loading") {
    if (!statusBox) return;
    statusBox.className = `admin-status-box ${tipo}`;
    statusBox.textContent = msg;
    statusBox.style.display = "block";
    statusBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function actualizarBadgeArchivo(inputEl, badgeId, iconoSvg) {
    if (!inputEl || !inputEl.parentNode) return;
    let badge = document.getElementById(badgeId);
    const file = inputEl.files && inputEl.files[0];
    if (!file) {
      if (badge) badge.style.display = "none";
      return;
    }
    if (!badge) {
      badge = document.createElement("div");
      badge.id = badgeId;
      badge.className = "admin-file-selected";
      inputEl.insertAdjacentElement("afterend", badge);
    }
    badge.innerHTML = `${iconoSvg}<span>${escapeHtml(file.name)} (${formatBytes(file.size)})</span>`;
    badge.style.display = "inline-flex";
  }

  // Pestaña 1: Paquete Temático (.zip)
  const dropzone = document.getElementById("dropzone-paquete");
  const fileInputPaquete = document.getElementById("file-paquete");
  const infoPaquete = document.getElementById("dropzone-paquete-info");
  const btnSubirPaquete = document.getElementById("btn-subir-paquete");

  let paqueteSeleccionado = null;

  function seleccionarPaquete(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setStatus("Por favor selecciona un archivo comprimido .zip", "error");
      return;
    }
    paqueteSeleccionado = file;
    const szMb = (file.size / (1024 * 1024)).toFixed(2);
    if (infoPaquete) {
      infoPaquete.innerHTML = `${SVG_PACKAGE}<span>${escapeHtml(file.name)} (${szMb} MB)</span>`;
      infoPaquete.style.display = "inline-flex";
    }
    if (btnSubirPaquete) btnSubirPaquete.disabled = false;
    if (statusBox) statusBox.style.display = "none";
  }

  if (dropzone && fileInputPaquete) {
    dropzone.addEventListener("click", () => fileInputPaquete.click());
    fileInputPaquete.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        seleccionarPaquete(e.target.files[0]);
      }
    });

    ["dragenter", "dragover"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        seleccionarPaquete(e.dataTransfer.files[0]);
      }
    });
  }

  if (btnSubirPaquete) {
    btnSubirPaquete.addEventListener("click", async () => {
      if (!paqueteSeleccionado) return;
      const originalHtml = btnSubirPaquete.innerHTML;
      btnSubirPaquete.disabled = true;
      btnSubirPaquete.innerHTML = `${SVG_SPINNER}<span>Integrando paquete...</span>`;
      setStatus("Subiendo y descomprimiendo paquete en el servidor local... Por favor espera.", "loading");

      try {
        const res = await fetch("/api/admin/subir_paquete", {
          method: "POST",
          headers: {
            "Content-Type": "application/zip",
            "X-Nombre-Archivo": encodeURIComponent(paqueteSeleccionado.name)
          },
          body: paqueteSeleccionado
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          setStatus(data.mensaje || "¡Paquete integrado con éxito!", "success");
          mostrarToast(data.mensaje || "Paquete integrado con éxito");
          fileInputPaquete.value = "";
          paqueteSeleccionado = null;
          if (infoPaquete) infoPaquete.style.display = "none";
          await cargarCatalogo();
          poblarSelectorSalas();
          renderizarGestionSalas();
        } else {
          setStatus("Error: " + (data.error || "No se pudo integrar el paquete"), "error");
          btnSubirPaquete.disabled = false;
        }
      } catch (err) {
        setStatus("Error de conexión al subir paquete: " + err.message, "error");
        btnSubirPaquete.disabled = false;
      } finally {
        btnSubirPaquete.innerHTML = originalHtml;
      }
    });
  }

  // Pestaña 2: Libro Individual (.epub / .pdf)
  const fileLibro = document.getElementById("file-libro");
  const filePortada = document.getElementById("file-portada");
  const selectSala = document.getElementById("select-sala-destino");
  const inputNuevaSala = document.getElementById("input-nueva-sala");
  const btnSubirLibro = document.getElementById("btn-subir-libro");

  if (selectSala && inputNuevaSala) {
    selectSala.addEventListener("change", () => {
      if (selectSala.value === "__NUEVA__") {
        inputNuevaSala.style.display = "block";
        inputNuevaSala.focus();
      } else {
        inputNuevaSala.style.display = "none";
      }
    });
  }

  if (fileLibro && btnSubirLibro) {
    fileLibro.addEventListener("change", () => {
      const hasFile = Boolean(fileLibro.files && fileLibro.files[0]);
      btnSubirLibro.disabled = !hasFile;
      actualizarBadgeArchivo(fileLibro, "badge-file-libro", SVG_FILE_TEXT);
      if (hasFile && statusBox) statusBox.style.display = "none";
    });
  }

  if (filePortada) {
    filePortada.addEventListener("change", () => {
      actualizarBadgeArchivo(filePortada, "badge-file-portada", SVG_IMAGE);
    });
  }

  function poblarSelectorSalas() {
    if (!selectSala) return;
    const coleccionesMap = new Map();
    catalogoLibros.forEach((l) => {
      if (l.coleccion && l.coleccion !== "Acervo General") {
        const carpetaRaw = l.archivo && l.archivo.includes("/")
          ? l.archivo.split("/")[0]
          : l.coleccion;
        if (!coleccionesMap.has(carpetaRaw)) {
          coleccionesMap.set(carpetaRaw, l.coleccion);
        }
      }
    });

    let opts = '<option value="Acervo General">Acervo General</option>';
    Array.from(coleccionesMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1], "es"))
      .forEach(([carpetaRaw, label]) => {
        opts += `<option value="${escapeHtml(carpetaRaw)}">${escapeHtml(label)}</option>`;
      });
    opts += '<option value="__NUEVA__">+ Crear nueva sala temática...</option>';
    selectSala.innerHTML = opts;
    if (inputNuevaSala) inputNuevaSala.style.display = "none";
  }

  if (btnSubirLibro) {
    btnSubirLibro.addEventListener("click", async () => {
      const bookFile = fileLibro && fileLibro.files && fileLibro.files[0];
      if (!bookFile) return;

      let salaElegida = selectSala ? selectSala.value : "Acervo General";
      if (salaElegida === "__NUEVA__") {
        salaElegida = (inputNuevaSala ? inputNuevaSala.value : "").trim();
        if (!salaElegida) {
          setStatus("Escribe el nombre de la nueva sala temática.", "error");
          return;
        }
      }

      const originalHtml = btnSubirLibro.innerHTML;
      btnSubirLibro.disabled = true;
      btnSubirLibro.innerHTML = `${SVG_SPINNER}<span>Subiendo obra...</span>`;
      setStatus("Guardando obra en el acervo...", "loading");

      try {
        const urlLibro = `/api/admin/subir_libro?archivo=${encodeURIComponent(bookFile.name)}&coleccion=${encodeURIComponent(salaElegida)}`;
        const resLibro = await fetch(urlLibro, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: bookFile
        });
        const dataLibro = await resLibro.json();

        if (!resLibro.ok || !dataLibro.ok) {
          setStatus("Error al subir libro: " + (dataLibro.error || "Desconocido"), "error");
          btnSubirLibro.disabled = false;
          return;
        }

        const coverFile = filePortada && filePortada.files && filePortada.files[0];
        if (coverFile) {
          setStatus("Subiendo portada acompañante...", "loading");
          const lastDot = bookFile.name.lastIndexOf(".");
          const stem = lastDot > 0 ? bookFile.name.substring(0, lastDot) : bookFile.name;
          const covDot = coverFile.name.lastIndexOf(".");
          const coverExt = covDot > 0 ? coverFile.name.substring(covDot).toLowerCase() : ".jpg";
          const coverName = stem + coverExt;

          const urlCover = `/api/admin/subir_libro?archivo=${encodeURIComponent(coverName)}&coleccion=${encodeURIComponent(salaElegida)}`;
          await fetch(urlCover, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: coverFile
          });
        }

        setStatus(`¡Obra '${bookFile.name}' integrada con éxito!`, "success");
        mostrarToast("Obra agregada con éxito");
        fileLibro.value = "";
        if (filePortada) filePortada.value = "";
        actualizarBadgeArchivo(fileLibro, "badge-file-libro", SVG_FILE_TEXT);
        if (filePortada) actualizarBadgeArchivo(filePortada, "badge-file-portada", SVG_IMAGE);
        if (inputNuevaSala) inputNuevaSala.value = "";
        btnSubirLibro.disabled = true;
        await cargarCatalogo();
        poblarSelectorSalas();
        renderizarGestionSalas();
      } catch (err) {
        setStatus("Error de conexión al subir obra: " + err.message, "error");
        btnSubirLibro.disabled = false;
      } finally {
        btnSubirLibro.innerHTML = originalHtml;
      }
    });
  }

  // Pestaña 3: Gestión de Salas
  function renderizarGestionSalas() {
    const contenedorSalas = document.getElementById("lista-gestion-salas");
    if (!contenedorSalas) return;

    if (catalogoLibros.length === 0) {
      contenedorSalas.innerHTML = `
        <div style="text-align: center; color: var(--text-tertiary); padding: 24px;">
          No hay salas ni libros instalados todavía.
        </div>
      `;
      return;
    }

    const salasMap = {};
    catalogoLibros.forEach((l) => {
      const col = l.coleccion || "Acervo General";
      if (!salasMap[col]) salasMap[col] = [];
      salasMap[col].push(l);
    });

    let html = "";
    Object.keys(salasMap).sort().forEach((col) => {
      const obras = salasMap[col];
      const carpetaRaw = obras[0] && obras[0].archivo && obras[0].archivo.includes("/")
        ? obras[0].archivo.split("/")[0]
        : col;
      html += `
        <div class="admin-sala-item">
          <div class="admin-sala-item-left">
            <span class="admin-sala-title">${escapeHtml(col)}</span>
            <span class="admin-sala-sub">${obras.length} ${obras.length === 1 ? "obra disponible" : "obras disponibles"}</span>
          </div>
          <div>
            ${col !== "Acervo General" ? `
              <button class="admin-btn-delete btn-del-sala" data-col="${escapeHtml(carpetaRaw)}" data-label="${escapeHtml(col)}">
                ${SVG_TRASH}<span>Retirar Sala</span>
              </button>
            ` : ""}
          </div>
        </div>
      `;
    });

    contenedorSalas.innerHTML = html;

    contenedorSalas.querySelectorAll(".btn-del-sala").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const colFolder = btn.getAttribute("data-col");
        const colLabel = btn.getAttribute("data-label");
        if (!confirm(`¿Estás seguro de retirar la sala '${colLabel}' y todas sus obras?`)) return;

        btn.disabled = true;
        btn.innerHTML = `${SVG_SPINNER}<span>Eliminando...</span>`;

        try {
          const res = await fetch(`/api/admin/eliminar_sala?coleccion=${encodeURIComponent(colFolder)}`, {
            method: "POST"
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            mostrarToast("Sala retirada: " + colLabel);
            await cargarCatalogo();
            poblarSelectorSalas();
            renderizarGestionSalas();
          } else {
            alert("No se pudo eliminar la sala: " + (data.error || "Error desconocido"));
            btn.disabled = false;
            btn.innerHTML = `${SVG_TRASH}<span>Retirar Sala</span>`;
          }
        } catch (err) {
          alert("Error de red: " + err.message);
          btn.disabled = false;
          btn.innerHTML = `${SVG_TRASH}<span>Retirar Sala</span>`;
        }
      });
    });
  }
}
