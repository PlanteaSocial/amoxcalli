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
let scrollProgresoTimer = null;
let ultimoIdAnotacion = 0;
let hlPopoverIdActivo = null;
let ttsSeleccionPendiente = null;
let ttsIgnorarLimpiezaSelHasta = 0;

const STORAGE_KEY_PROGRESO = `progreso_${archivoLibro}`;
const STORAGE_KEY_DIVISORES = `divisores_${archivoLibro}`;
const STORAGE_KEY_SUBRAYADOS = `subrayados_${archivoLibro}`;

function generarIdAnotacion() {
  ultimoIdAnotacion = Math.max(Date.now(), ultimoIdAnotacion + 1);
  return ultimoIdAnotacion;
}

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

const TTS_MAX_CHARS_POR_FRAGMENTO = 220;
const SVG_TTS_PLAY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>';
const SVG_TTS_PAUSE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

let ttsEstadoLectura = "idle"; // "idle" | "speaking" | "paused"
let ttsFragmentos = [];
let ttsIndiceActual = 0;
let ttsVelocidad = 1;
let ttsSessionId = 0;
let ttsVocesInicializadas = false;
let ttsHaIniciadoLectura = false;
let ttsVozSeleccionada = null;
let ttsUtteranceActual = null;
let ttsElementoResaltadoActual = null;
let ttsVocesFallidas = new Set();
let ttsAvisoPersistente = null;
let ttsTemporizadorVocesId = null;
let ttsMotorPreferido = "auto"; // "auto" | "webspeech" | "piper"
let ttsMotorActivo = "ninguno"; // "webspeech" | "piper" | "ninguno"
let ttsEstadoPiper = null;
let ttsConsultaPiperEnCurso = null;
let ttsCargandoMotor = false;
let ttsSintetizandoPiper = false;
let ttsAudioActual = null;
let ttsAudioUrlActual = null;
const ttsPrefetchCache = new Map();

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
  configurarInteraccionSubrayados();
  configurarSeguimientoScrollYSeleccion();
  inicializarControlesVozAlta();

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

function capturarPosicionScrollActual() {
  const cont = document.getElementById("contenedor-scroll");
  const lienzo = document.getElementById("reader-canvas");
  if (!cont) {
    return { scrollRatio: 0, anclaIndex: -1, anclaProgreso: 0, anclaTexto: "" };
  }

  const maxScroll = Math.max(0, cont.scrollHeight - cont.clientHeight);
  const scrollRatio = maxScroll > 0 ? Math.max(0, Math.min(1, cont.scrollTop / maxScroll)) : 0;

  let anclaIndex = -1;
  let anclaProgreso = 0;
  let anclaTexto = "";

  if (lienzo && !modoPdfOriginal && cont.scrollTop > 8) {
    const contRect = cont.getBoundingClientRect();
    const bloques = obtenerBloquesTextoLectura(lienzo);
    for (let i = 0; i < bloques.length; i += 1) {
      const el = bloques[i].el;
      if (!el || !el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) continue;
      if (rect.bottom >= contRect.top + 12) {
        anclaIndex = i;
        anclaProgreso = Math.max(0, Math.min(1, (contRect.top + 12 - rect.top) / rect.height));
        anclaTexto = bloques[i].texto.slice(0, 72);
        break;
      }
    }
  }

  return {
    scrollRatio: Number(scrollRatio.toFixed(6)),
    anclaIndex,
    anclaProgreso: Number(anclaProgreso.toFixed(4)),
    anclaTexto,
  };
}

function restaurarPosicionScroll(objetivo, opciones = {}) {
  const cont = document.getElementById("contenedor-scroll");
  const lienzo = document.getElementById("reader-canvas");
  if (!cont) return;

  if (!objetivo) {
    cont.scrollTop = 0;
    return;
  }

  const aplicar = () => {
    if (!cont.isConnected) return;
    const behavior = opciones.smooth ? "smooth" : "auto";
    const maxScroll = Math.max(0, cont.scrollHeight - cont.clientHeight);
    let targetTop = null;

    if (
      lienzo &&
      !modoPdfOriginal &&
      typeof objetivo.anclaIndex === "number" &&
      objetivo.anclaIndex >= 0
    ) {
      const bloques = obtenerBloquesTextoLectura(lienzo);
      let bloqueMatch = bloques[objetivo.anclaIndex] || null;
      const prefijo = (objetivo.anclaTexto || "").slice(0, 32);
      if (prefijo && (!bloqueMatch || !bloqueMatch.texto.includes(prefijo))) {
        bloqueMatch = bloques.find((b) => b.texto.includes(prefijo)) || bloqueMatch;
      }
      if (bloqueMatch && bloqueMatch.el && bloqueMatch.el.isConnected) {
        const contRect = cont.getBoundingClientRect();
        const elRect = bloqueMatch.el.getBoundingClientRect();
        const delta =
          elRect.top - contRect.top - 14 + (objetivo.anclaProgreso || 0) * elRect.height;
        targetTop = cont.scrollTop + delta;
      }
    }

    if (targetTop === null && typeof objetivo.scrollRatio === "number" && objetivo.scrollRatio > 0) {
      targetTop = objetivo.scrollRatio * maxScroll;
    }

    if (targetTop !== null) {
      const finalTop = Math.max(0, Math.min(maxScroll, Math.round(targetTop)));
      cont.scrollTo({ top: finalTop, behavior });
    } else {
      cont.scrollTop = 0;
    }
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(aplicar);
  });
}

function guardarProgreso(posicionNum, posScrollOpcional) {
  const posScroll = posScrollOpcional || capturarPosicionScrollActual();
  const data = {
    archivo: archivoLibro,
    formato: formatoLibro,
    pagina: formatoLibro === "PDF" ? posicionNum : undefined,
    capitulo: formatoLibro === "EPUB" ? posicionNum : undefined,
    scrollRatio: posScroll.scrollRatio,
    anclaIndex: posScroll.anclaIndex,
    anclaProgreso: posScroll.anclaProgreso,
    anclaTexto: posScroll.anclaTexto,
    fecha: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY_PROGRESO, JSON.stringify(data));
}

function guardarProgresoActualInmediato() {
  if (!archivoLibro) return;
  const posNum = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;
  guardarProgreso(posNum);
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

      let scrollObjetivoInicial = null;
      const progreso = localStorage.getItem(STORAGE_KEY_PROGRESO);
      if (progreso) {
        try {
          const p = JSON.parse(progreso);
          const pagGuardada = Math.max(1, Math.min(parseInt(p.pagina, 10) || 1, totalPaginasPdf));
          paginaActualPdf = pagGuardada;
          if (p.pagina === pagGuardada) {
            scrollObjetivoInicial = p;
          }
        } catch (e) {
          paginaActualPdf = 1;
        }
      }

      renderizarPaginaPdf(paginaActualPdf, { scrollObjetivo: scrollObjetivoInicial });
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

async function renderizarPaginaPdf(numPagina, opciones = {}) {
  detenerLecturaVozAlta({ silencioso: true });
  cerrarMenuBorrarSubrayado();
  ttsSeleccionPendiente = null;
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

      const cont = document.getElementById("contenedor-scroll");
      if (opciones.subrayadoObjetivoId) {
        resaltarYDesplazarASubrayado(opciones.subrayadoObjetivoId, false);
        guardarProgreso(paginaActualPdf);
      } else if (opciones.scrollObjetivo) {
        guardarProgreso(paginaActualPdf, opciones.scrollObjetivo);
        restaurarPosicionScroll(opciones.scrollObjetivo, { smooth: Boolean(opciones.smooth) });
      } else {
        if (cont) cont.scrollTop = 0;
        guardarProgreso(paginaActualPdf, { scrollRatio: 0, anclaIndex: -1, anclaProgreso: 0, anclaTexto: "" });
      }
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
    detenerLecturaVozAlta({ silencioso: true });
    cerrarPopoverVozAlta();
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

      let scrollObjetivoInicial = null;
      const progreso = localStorage.getItem(STORAGE_KEY_PROGRESO);
      if (progreso) {
        try {
          const p = JSON.parse(progreso);
          capituloActualIndex = parseInt(p.capitulo, 10) || 0;
          if (p.capitulo === capituloActualIndex) {
            scrollObjetivoInicial = p;
          }
        } catch (e) {
          capituloActualIndex = 0;
        }
      }

      if (!estructuraEpub.spine || capituloActualIndex >= estructuraEpub.spine.length) {
        capituloActualIndex = 0;
        scrollObjetivoInicial = null;
      }

      renderizarCapituloEpub(capituloActualIndex, { scrollObjetivo: scrollObjetivoInicial });
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

async function renderizarCapituloEpub(index, opciones = {}) {
  detenerLecturaVozAlta({ silencioso: true });
  cerrarMenuBorrarSubrayado();
  ttsSeleccionPendiente = null;
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

      const cont = document.getElementById("contenedor-scroll");
      if (opciones.subrayadoObjetivoId) {
        resaltarYDesplazarASubrayado(opciones.subrayadoObjetivoId, false);
        guardarProgreso(index);
      } else if (opciones.scrollObjetivo) {
        guardarProgreso(index, opciones.scrollObjetivo);
        restaurarPosicionScroll(opciones.scrollObjetivo, { smooth: Boolean(opciones.smooth) });
      } else {
        if (cont) cont.scrollTop = 0;
        guardarProgreso(index, { scrollRatio: 0, anclaIndex: -1, anclaProgreso: 0, anclaTexto: "" });
      }
    }
  } catch (e) {
    lienzo.innerHTML = `<p style="color: var(--text-tertiary);">Error al leer el capítulo.</p>`;
  }
}

// ============================================================================
// 3. CREAR Y BORRAR DIVISORES / MARCAPÁGINAS
// ============================================================================
function formatearPosicionConPorcentaje(scrollRatio) {
  const basePos =
    formatoLibro === "PDF" ? `Página ${paginaActualPdf}` : `Capítulo ${capituloActualIndex + 1}`;
  const pct = Math.round((scrollRatio || 0) * 100);
  return pct > 0 ? `${basePos} · ${pct}%` : basePos;
}

function abrirModalDivisor() {
  const posScroll = capturarPosicionScrollActual();
  const posActualTexto = formatearPosicionConPorcentaje(posScroll.scrollRatio);
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

  const posScroll = capturarPosicionScrollActual();
  const posActualTexto = formatearPosicionConPorcentaje(posScroll.scrollRatio);
  const posIndex = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;

  const nuevoDivisor = {
    id: generarIdAnotacion(),
    etiqueta: etiqueta,
    posicion: posActualTexto,
    indice: posIndex,
    formato: formatoLibro,
    scrollRatio: posScroll.scrollRatio,
    anclaIndex: posScroll.anclaIndex,
    anclaProgreso: posScroll.anclaProgreso,
    anclaTexto: posScroll.anclaTexto,
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
// 4. MOTOR DE SUBRAYADO POR OFFSETS DOM (SUPERPOSICIÓN + MINI MENÚ + DOBLE CLIC)
// ============================================================================
function obtenerNodosTextoLienzo(lienzo) {
  const ignorarSelector = ".empty-page-notice, .tts-ignore, script, style, svg, noscript";
  const nodos = [];
  let offset = 0;

  const walker = document.createTreeWalker(lienzo, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;
      const parentEl = node.parentElement;
      if (!parentEl || parentEl.closest(ignorarSelector)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let actual = walker.nextNode();
  while (actual) {
    const len = actual.nodeValue.length;
    nodos.push({ node: actual, start: offset, end: offset + len });
    offset += len;
    actual = walker.nextNode();
  }

  return {
    nodos,
    textoTotal: nodos.map((n) => n.node.nodeValue).join(""),
  };
}

function recortarEspaciosExtremosOffsets(textoTotal, rawStart, rawEnd) {
  let start = Math.max(0, rawStart);
  let end = Math.min(textoTotal.length, rawEnd);
  while (start < end && /\s/.test(textoTotal[start])) start += 1;
  while (end > start && /\s/.test(textoTotal[end - 1])) end -= 1;
  return {
    start,
    end,
    texto: textoTotal.slice(start, end).replace(/\s+/g, " ").trim(),
  };
}

function obtenerRangoOffsetsDesdeSeleccion(lienzo, range) {
  if (!lienzo || !range || range.collapsed) return null;
  if (!lienzo.contains(range.startContainer) || !lienzo.contains(range.endContainer)) {
    return null;
  }

  const { nodos, textoTotal } = obtenerNodosTextoLienzo(lienzo);
  let absStart = null;
  let absEnd = null;

  for (let i = 0; i < nodos.length; i += 1) {
    const entry = nodos[i];
    const len = entry.node.nodeValue.length;
    if (range.comparePoint(entry.node, len) < 0) {
      continue;
    }
    if (range.comparePoint(entry.node, 0) > 0) {
      break;
    }

    const localStart = range.startContainer === entry.node ? range.startOffset : 0;
    const localEnd = range.endContainer === entry.node ? range.endOffset : len;
    if (localEnd > localStart) {
      if (absStart === null) absStart = entry.start + localStart;
      absEnd = entry.start + localEnd;
    }
  }

  if (absStart === null || absEnd === null || absEnd <= absStart) return null;
  const recortado = recortarEspaciosExtremosOffsets(textoTotal, absStart, absEnd);
  return recortado.end > recortado.start && recortado.texto ? recortado : null;
}

function envolverRangoEnMarksDOM(nodos, lienzo, sub) {
  const colorClass = `hl-neon-${sub.color || "yellow"}`;
  for (let i = nodos.length - 1; i >= 0; i -= 1) {
    const entry = nodos[i];
    const segStart = Math.max(entry.start, sub.start);
    const segEnd = Math.min(entry.end, sub.end);
    if (segEnd <= segStart) continue;

    const textNode = entry.node;
    if (!textNode.isConnected) continue;

    const localStart = segStart - entry.start;
    const localEnd = segEnd - entry.start;
    const fragmento = textNode.nodeValue.slice(localStart, localEnd);
    if (!fragmento.trim() && textNode.parentElement === lienzo) {
      continue;
    }

    let nodoMedio = textNode;
    if (localEnd < nodoMedio.nodeValue.length) {
      nodoMedio.splitText(localEnd);
    }
    if (localStart > 0) {
      nodoMedio = nodoMedio.splitText(localStart);
    }

    const mark = document.createElement("mark");
    mark.className = colorClass;
    mark.setAttribute("data-hl-id", String(sub.id));
    mark.setAttribute("data-hl-start", String(segStart));
    mark.setAttribute("data-hl-end", String(segEnd));
    mark.setAttribute("title", "Clic para opciones · Doble clic para borrar");
    nodoMedio.parentNode.insertBefore(mark, nodoMedio);
    mark.appendChild(nodoMedio);
  }
}

function desenvolverTodosLosMarks(lienzo) {
  if (!lienzo) return;
  const marks = lienzo.querySelectorAll("mark[class*='hl-neon-']");
  if (marks.length === 0) return;

  marks.forEach((mark) => {
    const frag = document.createDocumentFragment();
    while (mark.firstChild) {
      frag.appendChild(mark.firstChild);
    }
    mark.replaceWith(frag);
  });
  lienzo.normalize();
}

function integrarNuevoSubrayadoEnPagina(lista, posId, nuevo, textoTotal) {
  const otros = lista.filter((s) => s.posicionId !== posId);
  const actuales = lista.filter((s) => s.posicionId === posId);
  const resultadoPagina = [];

  let mergeStart = nuevo.start;
  let mergeEnd = nuevo.end;

  for (const s of actuales) {
    if (typeof s.start !== "number" || typeof s.end !== "number") {
      resultadoPagina.push(s);
      continue;
    }

    if (s.color === nuevo.color) {
      if (s.end >= mergeStart && s.start <= mergeEnd) {
        mergeStart = Math.min(mergeStart, s.start);
        mergeEnd = Math.max(mergeEnd, s.end);
        continue;
      }
      resultadoPagina.push(s);
      continue;
    }

    if (s.end <= nuevo.start || s.start >= nuevo.end) {
      resultadoPagina.push(s);
      continue;
    }

    let usoIdOriginal = false;
    if (s.start < nuevo.start) {
      const izq = recortarEspaciosExtremosOffsets(textoTotal, s.start, nuevo.start);
      if (izq.end > izq.start && izq.texto) {
        usoIdOriginal = true;
        resultadoPagina.push({
          ...s,
          start: izq.start,
          end: izq.end,
          texto: izq.texto,
        });
      }
    }

    if (s.end > nuevo.end) {
      const der = recortarEspaciosExtremosOffsets(textoTotal, nuevo.end, s.end);
      if (der.end > der.start && der.texto) {
        resultadoPagina.push({
          ...s,
          id: usoIdOriginal ? generarIdAnotacion() : s.id,
          start: der.start,
          end: der.end,
          texto: der.texto,
        });
      }
    }
  }

  const combinado = recortarEspaciosExtremosOffsets(textoTotal, mergeStart, mergeEnd);
  if (combinado.end > combinado.start && combinado.texto) {
    resultadoPagina.push({
      id: nuevo.id,
      start: combinado.start,
      end: combinado.end,
      texto: combinado.texto,
      color: nuevo.color,
      posicionId: posId,
      posicionTexto: nuevo.posicionTexto,
      scrollRatio: nuevo.scrollRatio,
      fecha: nuevo.fecha,
    });
  }

  resultadoPagina.sort((a, b) => {
    const sa = typeof a.start === "number" ? a.start : Number.MAX_SAFE_INTEGER;
    const sb = typeof b.start === "number" ? b.start : Number.MAX_SAFE_INTEGER;
    return sa - sb;
  });

  return [...otros, ...resultadoPagina];
}

function subrayarTextoSeleccionado() {
  const lienzo = document.getElementById("reader-canvas");
  const seleccion = window.getSelection();
  if (!lienzo || !seleccion || seleccion.rangeCount === 0 || seleccion.isCollapsed) {
    mostrarToast("Selecciona primero una frase del texto con el cursor o tu dedo");
    return;
  }

  const range = seleccion.getRangeAt(0);
  const rangoOffsets = obtenerRangoOffsetsDesdeSeleccion(lienzo, range);
  if (!rangoOffsets) {
    mostrarToast("Selecciona texto dentro del libro para subrayarlo");
    return;
  }

  capturarSeleccionParaNarradorDesdeRange(lienzo, range);
  ttsIgnorarLimpiezaSelHasta = Date.now() + 500;
  cerrarMenuBorrarSubrayado();

  const { textoTotal } = obtenerNodosTextoLienzo(lienzo);
  const posId = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;
  const posScroll = capturarPosicionScrollActual();
  const nuevoSubrayado = {
    id: generarIdAnotacion(),
    start: rangoOffsets.start,
    end: rangoOffsets.end,
    texto: rangoOffsets.texto,
    color: colorNeonActivo,
    posicionId: posId,
    posicionTexto: formatoLibro === "PDF" ? `Pág. ${paginaActualPdf}` : `Cap. ${capituloActualIndex + 1}`,
    scrollRatio: posScroll.scrollRatio,
    fecha: new Date().toLocaleDateString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };

  listaSubrayados = integrarNuevoSubrayadoEnPagina(listaSubrayados, posId, nuevoSubrayado, textoTotal);
  localStorage.setItem(STORAGE_KEY_SUBRAYADOS, JSON.stringify(listaSubrayados));
  aplicarSubrayadosGuardados(posId);
  actualizarListaLateral();
  seleccion.removeAllRanges();
  mostrarToast("Texto subrayado (toca o haz doble clic sobre el trazo para quitarlo)");
}

function cerrarMenuBorrarSubrayado() {
  const popover = document.getElementById("popover-borrar-subrayado");
  if (popover) {
    popover.classList.remove("open");
  }
  hlPopoverIdActivo = null;
}

function abrirMenuBorrarSubrayado(markEl, id) {
  const popover = document.getElementById("popover-borrar-subrayado");
  if (!popover || !markEl) return;

  cerrarPopoverVozAlta();
  const popApariencia = document.getElementById("popover-apariencia");
  if (popApariencia) popApariencia.classList.remove("open");

  hlPopoverIdActivo = id;
  popover.classList.add("open");

  const rect = markEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(window.innerWidth - popRect.width - 8, rect.left + rect.width / 2 - popRect.width / 2)
  );
  const cabeArriba = rect.top - popRect.height - 8 >= 52;
  const top = cabeArriba ? rect.top - popRect.height - 8 : Math.min(window.innerHeight - popRect.height - 8, rect.bottom + 8);

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function configurarInteraccionSubrayados() {
  const lienzo = document.getElementById("reader-canvas");
  const popover = document.getElementById("popover-borrar-subrayado");
  const btnConfirmar = document.getElementById("btn-confirmar-borrar-hl");
  if (!lienzo) return;

  lienzo.addEventListener("click", (e) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      cerrarMenuBorrarSubrayado();
      return;
    }

    const markEl = e.target.closest("mark[class*='hl-neon-']");
    if (!markEl) {
      cerrarMenuBorrarSubrayado();
      return;
    }

    const idNum = parseInt(markEl.getAttribute("data-hl-id") || "", 10);
    if (Number.isNaN(idNum)) return;

    e.stopPropagation();
    if (hlPopoverIdActivo === idNum && popover && popover.classList.contains("open")) {
      cerrarMenuBorrarSubrayado();
    } else {
      abrirMenuBorrarSubrayado(markEl, idNum);
    }
  });

  lienzo.addEventListener("dblclick", (e) => {
    const markEl = e.target.closest("mark[class*='hl-neon-']");
    if (!markEl) return;

    const idNum = parseInt(markEl.getAttribute("data-hl-id") || "", 10);
    if (Number.isNaN(idNum)) return;

    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    cerrarMenuBorrarSubrayado();
    eliminarSubrayado(idNum);
  });

  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", (e) => {
      e.stopPropagation();
      const idObjetivo = hlPopoverIdActivo;
      cerrarMenuBorrarSubrayado();
      if (idObjetivo !== null) {
        eliminarSubrayado(idObjetivo);
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!popover || !popover.classList.contains("open")) return;
    if (!popover.contains(e.target) && !e.target.closest("mark[class*='hl-neon-']")) {
      cerrarMenuBorrarSubrayado();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cerrarMenuBorrarSubrayado();
    }
  });
}

function eliminarSubrayado(id, event) {
  if (event) event.stopPropagation();
  const lienzo = document.getElementById("reader-canvas");
  if (hlPopoverIdActivo === id) {
    cerrarMenuBorrarSubrayado();
  }

  if (lienzo) {
    const marksDom = lienzo.querySelectorAll(`mark[data-hl-id="${id}"]`);
    if (marksDom.length > 0) {
      marksDom.forEach((markDom) => {
        const frag = document.createDocumentFragment();
        while (markDom.firstChild) {
          frag.appendChild(markDom.firstChild);
        }
        markDom.replaceWith(frag);
      });
      lienzo.normalize();
    }
  }

  listaSubrayados = listaSubrayados.filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY_SUBRAYADOS, JSON.stringify(listaSubrayados));
  actualizarListaLateral();
  mostrarToast("Subrayado eliminado");
}

function resolverOffsetsSubrayadosLegacy(subrayadosPos, textoTotal) {
  let huboMigracion = false;
  subrayadosPos.forEach((s) => {
    if (typeof s.start === "number" && typeof s.end === "number") return;
    const limpio = (s.texto || "").trim();
    if (!limpio) return;

    let idx = textoTotal.indexOf(limpio);
    let matchLen = limpio.length;
    if (idx === -1) {
      const tokens = limpio.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (tokens.length > 0) {
        const regex = new RegExp(tokens.join("\\s+"));
        const m = textoTotal.match(regex);
        if (m && typeof m.index === "number") {
          idx = m.index;
          matchLen = m[0].length;
        }
      }
    }
    if (idx !== -1) {
      s.start = idx;
      s.end = idx + matchLen;
      huboMigracion = true;
    }
  });
  return huboMigracion;
}

function aplicarSubrayadosGuardados(posId) {
  const lienzo = document.getElementById("reader-canvas");
  if (!lienzo) return;

  desenvolverTodosLosMarks(lienzo);

  const subrayadosPos = listaSubrayados.filter((s) => s.posicionId === posId);
  if (subrayadosPos.length === 0) return;

  const { nodos, textoTotal } = obtenerNodosTextoLienzo(lienzo);
  if (nodos.length === 0) return;

  if (resolverOffsetsSubrayadosLegacy(subrayadosPos, textoTotal)) {
    localStorage.setItem(STORAGE_KEY_SUBRAYADOS, JSON.stringify(listaSubrayados));
  }

  const ordenados = subrayadosPos
    .filter((s) => typeof s.start === "number" && typeof s.end === "number" && s.end > s.start)
    .map((s) => ({
      ...s,
      start: Math.max(0, Math.min(textoTotal.length, s.start)),
      end: Math.max(0, Math.min(textoTotal.length, s.end)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  // Evitar rangos solapados al renderizar si hubiera datos legados inconsistentes
  const sinSolape = [];
  let cursorMin = 0;
  for (const item of ordenados) {
    const startSeguro = Math.max(item.start, cursorMin);
    if (item.end > startSeguro) {
      sinSolape.push({ ...item, start: startSeguro });
      cursorMin = item.end;
    }
  }

  for (let i = sinSolape.length - 1; i >= 0; i -= 1) {
    envolverRangoEnMarksDOM(nodos, lienzo, sinSolape[i]);
  }
}

function resaltarYDesplazarASubrayado(id, hacerFocusSilencioso = false) {
  const lienzo = document.getElementById("reader-canvas");
  if (!lienzo) return false;
  const mark = lienzo.querySelector(`mark[data-hl-id="${id}"]`);
  if (!mark) return false;

  requestAnimationFrame(() => {
    mark.scrollIntoView({ behavior: hacerFocusSilencioso ? "auto" : "smooth", block: "center" });
    mark.classList.remove("hl-jump-flash");
    void mark.offsetWidth;
    mark.classList.add("hl-jump-flash");
    setTimeout(() => {
      if (mark.isConnected) mark.classList.remove("hl-jump-flash");
    }, 1200);
  });
  return true;
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
        <div class="annotation-item" onclick="saltarADivisor(${d.id})">
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
          <div class="annotation-item" onclick="irASubrayado(${s.id})">
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

function saltarADivisor(idDivisor) {
  const divisor = listaDivisores.find((d) => d.id === idDivisor);
  if (!divisor) {
    // Compatibilidad por si alguna llamada directa pasara un índice numérico
    const idxDirecto = Number(idDivisor);
    if (!Number.isNaN(idxDirecto)) {
      if (formatoLibro === "PDF") {
        paginaActualPdf = idxDirecto;
        renderizarPaginaPdf(paginaActualPdf);
      } else {
        capituloActualIndex = idxDirecto;
        renderizarCapituloEpub(capituloActualIndex);
      }
    }
    return;
  }

  cerrarMenuBorrarSubrayado();
  const scrollObjetivo = {
    scrollRatio: typeof divisor.scrollRatio === "number" ? divisor.scrollRatio : 0,
    anclaIndex: typeof divisor.anclaIndex === "number" ? divisor.anclaIndex : -1,
    anclaProgreso: typeof divisor.anclaProgreso === "number" ? divisor.anclaProgreso : 0,
    anclaTexto: divisor.anclaTexto || "",
  };

  const posActual = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;
  if (posActual === divisor.indice && !modoPdfOriginal) {
    restaurarPosicionScroll(scrollObjetivo, { smooth: true });
    guardarProgreso(divisor.indice, scrollObjetivo);
    return;
  }

  if (formatoLibro === "PDF") {
    if (modoPdfOriginal) alternarModoPdfOriginal();
    paginaActualPdf = divisor.indice;
    renderizarPaginaPdf(paginaActualPdf, { scrollObjetivo });
  } else {
    capituloActualIndex = divisor.indice;
    renderizarCapituloEpub(capituloActualIndex, { scrollObjetivo });
  }
}

function irASubrayado(idSubrayado) {
  const sub = listaSubrayados.find((s) => s.id === idSubrayado);
  if (!sub) return;

  cerrarMenuBorrarSubrayado();
  const posActual = formatoLibro === "PDF" ? paginaActualPdf : capituloActualIndex;
  if (posActual === sub.posicionId && !modoPdfOriginal) {
    if (!resaltarYDesplazarASubrayado(sub.id, false) && typeof sub.scrollRatio === "number") {
      restaurarPosicionScroll({ scrollRatio: sub.scrollRatio }, { smooth: true });
    }
    return;
  }

  const scrollRespaldo =
    typeof sub.scrollRatio === "number"
      ? { scrollRatio: sub.scrollRatio, anclaIndex: -1, anclaProgreso: 0, anclaTexto: "" }
      : null;

  if (formatoLibro === "PDF") {
    if (modoPdfOriginal) alternarModoPdfOriginal();
    paginaActualPdf = sub.posicionId;
    renderizarPaginaPdf(paginaActualPdf, {
      subrayadoObjetivoId: sub.id,
      scrollObjetivo: scrollRespaldo,
    });
  } else {
    capituloActualIndex = sub.posicionId;
    renderizarCapituloEpub(capituloActualIndex, {
      subrayadoObjetivoId: sub.id,
      scrollObjetivo: scrollRespaldo,
    });
  }
}

function configurarSeguimientoScrollYSeleccion() {
  const cont = document.getElementById("contenedor-scroll");
  if (cont) {
    cont.addEventListener(
      "scroll",
      () => {
        cerrarMenuBorrarSubrayado();
        if (scrollProgresoTimer) clearTimeout(scrollProgresoTimer);
        scrollProgresoTimer = setTimeout(() => {
          scrollProgresoTimer = null;
          guardarProgresoActualInmediato();
        }, 200);
      },
      { passive: true }
    );
  }

  // Conservar la selección activa sin perderla por cambio de foco al pulsar color/subrayar/escuchar
  document.addEventListener(
    "mousedown",
    (e) => {
      if (
        e.target.closest("#btn-voz-alta, #btn-tts-play-pause, #btn-subrayar-neon, .neon-palette")
      ) {
        e.preventDefault();
      }
    },
    true
  );

  // Conservar la selección antes de que el clic en botones del HUD o Escuchar limpie el rango activo
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        e.target.closest("#btn-voz-alta, #popover-voz-alta, #btn-subrayar-neon, .neon-palette")
      ) {
        ttsIgnorarLimpiezaSelHasta = Date.now() + 500;
        const lienzo = document.getElementById("reader-canvas");
        const sel = window.getSelection();
        if (lienzo && sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          capturarSeleccionParaNarradorDesdeRange(lienzo, sel.getRangeAt(0));
        }
      }
    },
    true
  );

  document.addEventListener("selectionchange", () => {
    const lienzo = document.getElementById("reader-canvas");
    if (!lienzo || modoPdfOriginal) return;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (lienzo.contains(range.startContainer) && sel.toString().trim()) {
        capturarSeleccionParaNarradorDesdeRange(lienzo, range);
        return;
      }
    }

    if (Date.now() > ttsIgnorarLimpiezaSelHasta) {
      ttsSeleccionPendiente = null;
    }
  });

  window.addEventListener("beforeunload", guardarProgresoActualInmediato);
  window.addEventListener("pagehide", guardarProgresoActualInmediato);
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
  const btnDesubrayar = document.getElementById("btn-desubrayar");
  if (btnDesubrayar) {
    btnDesubrayar.addEventListener("click", () => mostrarToast("Toca o haz doble clic en un subrayado para borrarlo"));
  }
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
      cerrarPopoverVozAlta();
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

// ============================================================================
// 7. MODO LECTURA EN VOZ ALTA OFFLINE · OLA 1 (WEB SPEECH API)
// ============================================================================

function soportaSpeechSynthesis() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    window.speechSynthesis != null &&
    typeof window.speechSynthesis.speak === "function" &&
    typeof window.speechSynthesis.cancel === "function" &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

function soportaMotorPiperNavegador() {
  return (
    typeof window !== "undefined" &&
    window.AmoxcalliPiperTTS != null &&
    typeof WebAssembly === "object" &&
    typeof Audio === "function"
  );
}

function soportaLecturaVozAlta() {
  return soportaSpeechSynthesis() || soportaMotorPiperNavegador();
}

function consultarEstadoPiperBajoDemanda() {
  if (!soportaMotorPiperNavegador()) {
    ttsEstadoPiper = { disponible: false };
    return Promise.resolve(ttsEstadoPiper);
  }
  if (ttsEstadoPiper) {
    return Promise.resolve(ttsEstadoPiper);
  }
  if (ttsConsultaPiperEnCurso) {
    return ttsConsultaPiperEnCurso;
  }
  ttsConsultaPiperEnCurso = window.AmoxcalliPiperTTS
    .consultarDisponibilidad()
    .then((datos) => {
      ttsEstadoPiper = datos || { disponible: false };
      return ttsEstadoPiper;
    })
    .catch(() => {
      ttsEstadoPiper = { disponible: false };
      return ttsEstadoPiper;
    })
    .finally(() => {
      ttsConsultaPiperEnCurso = null;
      if (ttsVocesInicializadas && ttsEstadoLectura === "idle") {
        actualizarVozTtsPreferida(obtenerVocesDisponiblesTts().length === 0);
      }
    });
  return ttsConsultaPiperEnCurso;
}

function inicializarControlesVozAlta() {
  const wrap = document.getElementById("wrap-voz-alta");
  const btnPrincipal = document.getElementById("btn-voz-alta");
  const popover = document.getElementById("popover-voz-alta");

  if (!wrap || !btnPrincipal || !popover) return;

  if (!soportaLecturaVozAlta()) {
    wrap.style.display = "none";
    wrap.hidden = true;
    btnPrincipal.disabled = true;
    return;
  }

  actualizarInterfazVozAlta();

  btnPrincipal.addEventListener("click", (e) => {
    e.stopPropagation();
    const popoverApariencia = document.getElementById("popover-apariencia");
    if (popoverApariencia) popoverApariencia.classList.remove("open");

    const yaInicializado = ttsVocesInicializadas;
    inicializarVocesTtsBajoDemanda();
    const abierto = popover.classList.toggle("open");
    btnPrincipal.setAttribute("aria-expanded", abierto ? "true" : "false");
    if (abierto && yaInicializado && ttsEstadoLectura === "idle") {
      consultarEstadoPiperBajoDemanda();
      actualizarVozTtsPreferida(obtenerVocesDisponiblesTts().length === 0);
    }
  });

  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && !btnPrincipal.contains(e.target)) {
      cerrarPopoverVozAlta();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cerrarPopoverVozAlta();
      const popoverApariencia = document.getElementById("popover-apariencia");
      if (popoverApariencia) popoverApariencia.classList.remove("open");
    }
  });

  const btnPlayPause = document.getElementById("btn-tts-play-pause");
  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", () => {
      alternarPlayPausaVozAlta();
    });
  }

  const btnStop = document.getElementById("btn-tts-stop");
  if (btnStop) {
    btnStop.addEventListener("click", () => {
      detenerLecturaVozAlta();
    });
  }

  document.querySelectorAll(".tts-rate-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rate = parseFloat(btn.dataset.ttsRate || "1");
      if (!Number.isNaN(rate)) {
        cambiarVelocidadVozAlta(rate);
      }
    });
  });

  document.querySelectorAll('.floating-toolbar a[href], a[href="index.html"]').forEach((enlace) => {
    enlace.addEventListener("click", () => {
      detenerLecturaVozAlta({ silencioso: true });
    });
  });

  window.addEventListener("beforeunload", () => detenerLecturaVozAlta({ silencioso: true }));
  window.addEventListener("pagehide", () => detenerLecturaVozAlta({ silencioso: true }));
}

function cerrarPopoverVozAlta() {
  const popover = document.getElementById("popover-voz-alta");
  const btnPrincipal = document.getElementById("btn-voz-alta");
  if (popover) popover.classList.remove("open");
  if (btnPrincipal) btnPrincipal.setAttribute("aria-expanded", "false");
}

function obtenerVocesDisponiblesTts() {
  if (!soportaSpeechSynthesis() || typeof window.speechSynthesis.getVoices !== "function") {
    return [];
  }
  try {
    return window.speechSynthesis.getVoices() || [];
  } catch (_) {
    return [];
  }
}

function obtenerClaveVozTts(voz) {
  if (!voz) return "";
  return `${voz.voiceURI || ""}||${voz.name || ""}||${voz.lang || ""}`;
}

function inicializarVocesTtsBajoDemanda() {
  if (!ttsVocesInicializadas) {
    ttsVocesInicializadas = true;
    consultarEstadoPiperBajoDemanda();
    actualizarVozTtsPreferida(false);

    if (soportaSpeechSynthesis()) {
      const manejarCambioVoces = () => actualizarVozTtsPreferida(false);
      if (typeof window.speechSynthesis.addEventListener === "function") {
        window.speechSynthesis.addEventListener("voiceschanged", manejarCambioVoces);
      } else {
        window.speechSynthesis.onvoiceschanged = manejarCambioVoces;
      }

      if (obtenerVocesDisponiblesTts().length === 0) {
        if (ttsTemporizadorVocesId) clearTimeout(ttsTemporizadorVocesId);
        ttsTemporizadorVocesId = setTimeout(() => {
          ttsTemporizadorVocesId = null;
          if (ttsVocesInicializadas && ttsEstadoLectura === "idle") {
            actualizarVozTtsPreferida(true);
          }
        }, 350);
      }
    }
  }
}

function puntuarVozEspanol(voz) {
  if (!voz || typeof voz.lang !== "string" || !/^es([-_]|$)/i.test(voz.lang)) {
    return -1;
  }
  let puntaje = 1;
  if (voz.localService) puntaje += 10; // Prioridad absoluta offline a voces locales
  if (/^es[-_](mx|419|es)/i.test(voz.lang)) puntaje += 4;
  if (/^es[-_](mx|419)/i.test(voz.lang)) puntaje += 2;
  if (voz.default) puntaje += 1;
  return puntaje;
}

function buscarVozEspanolNoFallida(voces) {
  let mejorVoz = null;
  let mejorPuntaje = -1;
  for (const voz of voces) {
    if (ttsVocesFallidas.has(obtenerClaveVozTts(voz))) continue;
    const puntaje = puntuarVozEspanol(voz);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorVoz = voz;
    }
  }
  return mejorVoz;
}

function actualizarSelectorMotorTts(hayVozNativa, hayPiper) {
  const popover = document.getElementById("popover-voz-alta");
  const infoEl = document.getElementById("tts-voz-info");
  if (!popover || !infoEl) return;

  let contenedor = document.getElementById("tts-engine-switch");
  if (!hayVozNativa || !hayPiper) {
    if (contenedor) contenedor.remove();
    return;
  }

  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.id = "tts-engine-switch";
    contenedor.className = "tts-engine-switch";

    const label = document.createElement("span");
    label.className = "popover-label";
    label.style.marginBottom = "0";
    label.textContent = "Motor";

    const pills = document.createElement("div");
    pills.className = "tts-engine-pills";

    [
      { id: "webspeech", titulo: "Sistema" },
      { id: "piper", titulo: "Neuronal" },
    ].forEach((op) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tts-engine-btn";
      btn.dataset.ttsMotor = op.id;
      btn.textContent = op.titulo;
      btn.addEventListener("click", () => {
        if (ttsMotorPreferido === op.id) return;
        const estabaLeyendo = ttsEstadoLectura !== "idle";
        const idxReanudar = ttsIndiceActual;
        ttsMotorPreferido = op.id;
        actualizarVozTtsPreferida(false);
        if (estabaLeyendo) {
          detenerLecturaVozAlta({ silencioso: true });
          iniciarLecturaVozAlta(idxReanudar);
        }
      });
      pills.appendChild(btn);
    });

    contenedor.appendChild(label);
    contenedor.appendChild(pills);
    popover.insertBefore(contenedor, infoEl);
  }

  contenedor.querySelectorAll(".tts-engine-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ttsMotor === ttsMotorActivo);
  });
}

function actualizarVozTtsPreferida(esRevalidacionTardia = false) {
  if (!soportaLecturaVozAlta()) return;
  const voces = soportaSpeechSynthesis() ? obtenerVocesDisponiblesTts() : [];
  if (voces.length > 0 && ttsTemporizadorVocesId) {
    clearTimeout(ttsTemporizadorVocesId);
    ttsTemporizadorVocesId = null;
  }

  ttsVozSeleccionada = buscarVozEspanolNoFallida(voces);
  const piperDisponible = Boolean(ttsEstadoPiper && ttsEstadoPiper.disponible);
  const consultandoPiper = Boolean(ttsConsultaPiperEnCurso);

  if (ttsMotorPreferido === "piper" && piperDisponible) {
    ttsMotorActivo = "piper";
  } else if (ttsVozSeleccionada) {
    ttsMotorActivo = "webspeech";
  } else if (piperDisponible) {
    ttsMotorActivo = "piper";
  } else if (voces.length > 0 && soportaSpeechSynthesis()) {
    ttsMotorActivo = "webspeech";
  } else {
    ttsMotorActivo = "ninguno";
  }

  actualizarSelectorMotorTts(Boolean(ttsVozSeleccionada), piperDisponible);

  const infoEl = document.getElementById("tts-voz-info");
  if (!infoEl) {
    actualizarInterfazVozAlta();
    return;
  }

  if (ttsMotorActivo === "piper") {
    ttsAvisoPersistente = null;
    infoEl.classList.remove("is-warning");
    infoEl.textContent =
      (ttsEstadoPiper && ttsEstadoPiper.etiqueta) || "Voz neuronal es_MX (offline)";
  } else if (ttsVozSeleccionada) {
    ttsAvisoPersistente = null;
    infoEl.classList.remove("is-warning");
    infoEl.textContent = `Voz: ${ttsVozSeleccionada.name} (${ttsVozSeleccionada.lang})`;
  } else if (voces.length > 0 && soportaSpeechSynthesis()) {
    ttsAvisoPersistente = null;
    infoEl.classList.remove("is-warning");
    infoEl.textContent = "Voz predeterminada del sistema (es)";
  } else if (!consultandoPiper && (esRevalidacionTardia || !soportaSpeechSynthesis())) {
    ttsAvisoPersistente = {
      badge: "Sin voces",
      info: "Sin voces de texto a voz en este navegador (en Linux requiere speech-dispatcher/espeak-ng o edición Medio/Completo con voz neuronal).",
      esWarning: true,
    };
    infoEl.classList.add("is-warning");
    infoEl.textContent = ttsAvisoPersistente.info;
  } else if (!ttsAvisoPersistente) {
    infoEl.classList.remove("is-warning");
    infoEl.textContent = "Comprobando voces offline...";
  }

  actualizarInterfazVozAlta();
}

function dividirTextoEnFragmentos(texto, maxChars = TTS_MAX_CHARS_POR_FRAGMENTO) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  if (limpio.length <= maxChars) return [limpio];

  const oraciones = limpio.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [limpio];
  const piezas = [];

  for (const rawOracion of oraciones) {
    const oracion = rawOracion.trim();
    if (!oracion) continue;
    if (oracion.length <= maxChars) {
      piezas.push(oracion);
      continue;
    }

    const clausulas = oracion.match(/[^,;:—–]+(?:[,;:—–]+|$)/g) || [oracion];
    for (const rawClausula of clausulas) {
      const clausula = rawClausula.trim();
      if (!clausula) continue;
      if (clausula.length <= maxChars) {
        piezas.push(clausula);
        continue;
      }

      const palabras = clausula.split(/\s+/);
      let actual = "";
      for (const palabra of palabras) {
        if (palabra.length > maxChars) {
          if (actual) {
            piezas.push(actual);
            actual = "";
          }
          for (let i = 0; i < palabra.length; i += maxChars) {
            piezas.push(palabra.slice(i, i + maxChars));
          }
          continue;
        }
        const candidato = actual ? `${actual} ${palabra}` : palabra;
        if (candidato.length <= maxChars) {
          actual = candidato;
        } else {
          if (actual) piezas.push(actual);
          actual = palabra;
        }
      }
      if (actual) piezas.push(actual);
    }
  }

  const fragmentos = [];
  let buffer = "";
  for (const pieza of piezas) {
    const combinado = buffer ? `${buffer} ${pieza}` : pieza;
    if (combinado.length <= maxChars) {
      buffer = combinado;
    } else {
      if (buffer) fragmentos.push(buffer);
      buffer = pieza;
    }
  }
  if (buffer) fragmentos.push(buffer);
  return fragmentos;
}

function obtenerBloquesTextoLectura(lienzo) {
  const selectorBloques = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, dt, dd";
  const ignorarSelector = ".empty-page-notice, .tts-ignore, script, style, svg, noscript";

  const recolectarHojas = (selectorCandidatos, selectorAnidados) => {
    const bloques = [];
    lienzo.querySelectorAll(selectorCandidatos).forEach((el) => {
      if (el.closest(ignorarSelector) || el.hidden) return;
      if (el.querySelector(selectorAnidados)) return;
      const texto = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (texto) bloques.push({ texto, el });
    });
    return bloques;
  };

  let bloques = recolectarHojas(selectorBloques, selectorBloques);
  if (bloques.length === 0) {
    bloques = recolectarHojas(
      "div, section, article, span",
      `${selectorBloques}, div, section, article`
    );
  }
  if (bloques.length === 0 && !lienzo.querySelector(".empty-page-notice")) {
    const crudo = (lienzo.innerText || lienzo.textContent || "").trim();
    if (crudo) {
      crudo.split(/\n+/).forEach((linea) => {
        const texto = linea.replace(/\s+/g, " ").trim();
        if (texto) bloques.push({ texto, el: null });
      });
    }
  }
  return bloques;
}

function capturarSeleccionParaNarradorDesdeRange(lienzo, range) {
  if (!lienzo || !range || range.collapsed) return null;
  if (!lienzo.contains(range.startContainer)) return null;

  const bloques = obtenerBloquesTextoLectura(lienzo);
  if (bloques.length === 0) return null;

  let bloqueMatch = null;
  let offsetEnBloque = 0;

  for (const bloque of bloques) {
    if (!bloque.el || !bloque.el.isConnected) continue;
    if (bloque.el.contains(range.startContainer)) {
      bloqueMatch = bloque;
      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(bloque.el);
        preRange.setEnd(range.startContainer, range.startOffset);
        offsetEnBloque = preRange.toString().replace(/\s+/g, " ").trimStart().length;
      } catch (_) {
        offsetEnBloque = 0;
      }
      break;
    }
  }

  if (!bloqueMatch) {
    for (const bloque of bloques) {
      if (!bloque.el || !bloque.el.isConnected) continue;
      try {
        if (range.intersectsNode(bloque.el)) {
          bloqueMatch = bloque;
          offsetEnBloque = 0;
          break;
        }
      } catch (_) {}
    }
  }

  if (!bloqueMatch) return null;
  ttsSeleccionPendiente = {
    bloqueEl: bloqueMatch.el,
    offsetEnBloque,
    bloqueTextoPrefijo: bloqueMatch.texto.slice(0, 60),
  };
  return ttsSeleccionPendiente;
}

function extraerFragmentosLecturaTts() {
  if (modoPdfOriginal) return [];
  const lienzo = document.getElementById("reader-canvas");
  if (!lienzo) return [];

  const bloques = obtenerBloquesTextoLectura(lienzo);
  const fragmentos = [];
  for (const bloque of bloques) {
    const partes = dividirTextoEnFragmentos(bloque.texto, TTS_MAX_CHARS_POR_FRAGMENTO);
    let cursorPos = 0;
    for (const parte of partes) {
      const idx = bloque.texto.indexOf(parte, cursorPos);
      const inicioEnBloque = idx !== -1 ? idx : cursorPos;
      const finEnBloque = inicioEnBloque + parte.length;
      cursorPos = finEnBloque;
      fragmentos.push({
        texto: parte,
        el: bloque.el,
        inicioEnBloque,
        finEnBloque,
      });
    }
  }
  return fragmentos;
}

function resolverIndiceInicioTts(fragmentos) {
  const lienzo = document.getElementById("reader-canvas");
  const cont = document.getElementById("contenedor-scroll");

  if (lienzo) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim()) {
      capturarSeleccionParaNarradorDesdeRange(lienzo, sel.getRangeAt(0));
    }
  }

  if (ttsSeleccionPendiente) {
    const selObj = ttsSeleccionPendiente;
    ttsSeleccionPendiente = null;

    let idxBloqueInicio = -1;
    for (let i = 0; i < fragmentos.length; i += 1) {
      const f = fragmentos[i];
      const coincideEl = selObj.bloqueEl && f.el === selObj.bloqueEl;
      const coincideTexto =
        !coincideEl &&
        selObj.bloqueTextoPrefijo &&
        f.el &&
        (f.el.innerText || f.el.textContent || "").replace(/\s+/g, " ").trim().startsWith(selObj.bloqueTextoPrefijo);
      if (coincideEl || coincideTexto) {
        if (idxBloqueInicio === -1) idxBloqueInicio = i;
        if (selObj.offsetEnBloque < f.finEnBloque) {
          return { indice: i, origen: "seleccion", ajustarScroll: false };
        }
      }
    }
    if (idxBloqueInicio !== -1) {
      return { indice: idxBloqueInicio, origen: "seleccion", ajustarScroll: false };
    }
  }

  if (cont && cont.scrollTop > 36) {
    const contRect = cont.getBoundingClientRect();
    for (let i = 0; i < fragmentos.length; i += 1) {
      const el = fragmentos[i].el;
      if (!el || !el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) continue;
      if (rect.bottom >= contRect.top + 16) {
        return { indice: i, origen: "vista", ajustarScroll: true, elAncla: el };
      }
    }
  }

  return { indice: 0, origen: "inicio", ajustarScroll: false };
}

function marcarBloqueLecturaTts(el) {
  if (ttsElementoResaltadoActual && ttsElementoResaltadoActual !== el) {
    ttsElementoResaltadoActual.classList.remove("tts-reading-block");
    ttsElementoResaltadoActual = null;
  }
  if (!el || !el.isConnected) return;

  if (ttsElementoResaltadoActual !== el) {
    el.classList.add("tts-reading-block");
    ttsElementoResaltadoActual = el;
  }

  if (typeof el.getBoundingClientRect === "function" && typeof el.scrollIntoView === "function") {
    const rect = el.getBoundingClientRect();
    if (rect.top < 78 || rect.bottom > window.innerHeight - 24) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function limpiarResaltadoBloqueTts() {
  if (ttsElementoResaltadoActual) {
    ttsElementoResaltadoActual.classList.remove("tts-reading-block");
    ttsElementoResaltadoActual = null;
  }
  document.querySelectorAll(".tts-reading-block").forEach((nodo) => {
    nodo.classList.remove("tts-reading-block");
  });
}

function limpiarAudioActualTts() {
  if (ttsAudioActual) {
    ttsAudioActual.onended = null;
    ttsAudioActual.onerror = null;
    try { ttsAudioActual.pause(); } catch (_) {}
    try {
      ttsAudioActual.src = "";
      ttsAudioActual.load();
    } catch (_) {}
    ttsAudioActual = null;
  }
  if (ttsAudioUrlActual) {
    try { URL.revokeObjectURL(ttsAudioUrlActual); } catch (_) {}
    ttsAudioUrlActual = null;
  }
}

function limpiarPrefetchTts() {
  ttsPrefetchCache.forEach((promesa) => {
    Promise.resolve(promesa)
      .then((res) => {
        if (res && res.url) {
          try { URL.revokeObjectURL(res.url); } catch (_) {}
        }
      })
      .catch(() => {});
  });
  ttsPrefetchCache.clear();
}

function alternarPlayPausaVozAlta() {
  if (!soportaLecturaVozAlta()) return;
  if (ttsCargandoMotor) return;
  if (ttsEstadoLectura === "speaking") {
    pausarLecturaVozAlta();
  } else if (ttsEstadoLectura === "paused") {
    reanudarLecturaVozAlta();
  } else {
    iniciarLecturaVozAlta();
  }
}

async function iniciarLecturaVozAlta(indiceInicial) {
  if (!soportaLecturaVozAlta()) return;

  if (modoPdfOriginal) {
    mostrarToast("Cambia a Texto Fluido para escuchar en voz alta");
    return;
  }

  const fragmentos = extraerFragmentosLecturaTts();
  if (fragmentos.length === 0) {
    mostrarToast("No hay texto disponible en esta vista para leer");
    return;
  }

  let idxInicio = 0;
  let destino = null;
  if (typeof indiceInicial === "number" && !Number.isNaN(indiceInicial)) {
    idxInicio = Math.max(0, Math.min(fragmentos.length - 1, indiceInicial));
  } else {
    destino = resolverIndiceInicioTts(fragmentos);
    idxInicio = Math.max(0, Math.min(fragmentos.length - 1, destino.indice));
  }

  ttsVocesFallidas.clear();
  ttsAvisoPersistente = null;
  ttsHaIniciadoLectura = true;
  ttsSessionId += 1;
  const sesionId = ttsSessionId;

  ttsUtteranceActual = null;
  limpiarAudioActualTts();
  limpiarPrefetchTts();
  if (soportaSpeechSynthesis() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }

  if (destino && destino.origen === "seleccion") {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  } else if (destino && destino.ajustarScroll && destino.elAncla) {
    const cont = document.getElementById("contenedor-scroll");
    if (cont && destino.elAncla.isConnected) {
      const contRect = cont.getBoundingClientRect();
      const elRect = destino.elAncla.getBoundingClientRect();
      const nuevoTop = Math.max(0, cont.scrollTop + (elRect.top - contRect.top) - 24);
      cont.scrollTo({ top: nuevoTop, behavior: "smooth" });
    }
  }

  ttsFragmentos = fragmentos;
  ttsIndiceActual = idxInicio;

  inicializarVocesTtsBajoDemanda();
  await consultarEstadoPiperBajoDemanda();
  if (sesionId !== ttsSessionId) return;

  actualizarVozTtsPreferida(false);

  if (ttsMotorActivo === "piper") {
    await arrancarLecturaPiperDesde(ttsIndiceActual, sesionId);
    return;
  }

  if (ttsMotorActivo === "webspeech" && soportaSpeechSynthesis()) {
    ttsCargandoMotor = false;
    ttsEstadoLectura = "speaking";
    actualizarInterfazVozAlta();
    hablarFragmentoTts(ttsIndiceActual, sesionId);
    return;
  }

  ttsHaIniciadoLectura = false;
  reportarErrorSintesisTts("no-voices", obtenerVocesDisponiblesTts(), false);
}

async function arrancarLecturaPiperDesde(indice, sesionId) {
  if (sesionId !== ttsSessionId) return;
  if (!ttsEstadoPiper || !ttsEstadoPiper.disponible || !window.AmoxcalliPiperTTS) {
    reportarErrorSintesisTts("piper-unavailable", obtenerVocesDisponiblesTts(), false);
    return;
  }

  if (!window.AmoxcalliPiperTTS.estaListoEnMemoria()) {
    ttsEstadoLectura = "speaking";
    ttsCargandoMotor = true;
    actualizarInterfazVozAlta("Preparando...");
    const infoEl = document.getElementById("tts-voz-info");
    if (infoEl) {
      infoEl.classList.remove("is-warning");
      infoEl.textContent = "Cargando voz neuronal offline...";
    }

    try {
      await window.AmoxcalliPiperTTS.asegurarCargado(ttsEstadoPiper.archivos, (fase) => {
        if (sesionId !== ttsSessionId) return;
        const info = document.getElementById("tts-voz-info");
        if (info && fase === "inicializando") {
          info.textContent = "Inicializando voz neuronal...";
        }
      });
    } catch (_) {
      if (sesionId !== ttsSessionId) return;
      ttsCargandoMotor = false;
      reportarErrorSintesisTts("piper-load-failed", obtenerVocesDisponiblesTts(), false);
      return;
    }

    if (sesionId !== ttsSessionId) {
      ttsCargandoMotor = false;
      return;
    }
  }

  ttsCargandoMotor = false;
  ttsEstadoLectura = "speaking";
  actualizarVozTtsPreferida(false);
  actualizarInterfazVozAlta();
  await hablarFragmentoPiper(indice, sesionId);
}

function precargarFragmentoPiper(indice, sesionId) {
  if (sesionId !== ttsSessionId || ttsEstadoLectura === "idle") return;
  if (indice < 0 || indice >= ttsFragmentos.length || ttsPrefetchCache.has(indice)) return;
  if (!window.AmoxcalliPiperTTS) return;

  const texto = ttsFragmentos[indice].texto;
  const promesa = window.AmoxcalliPiperTTS
    .sintetizarWavUrl(texto, { shouldAbort: () => sesionId !== ttsSessionId })
    .then((res) => {
      if (res && res.url && sesionId !== ttsSessionId) {
        try { URL.revokeObjectURL(res.url); } catch (_) {}
        return null;
      }
      return res;
    })
    .catch(() => null);

  ttsPrefetchCache.set(indice, promesa);
}

async function obtenerAudioFragmentoPiper(indice, sesionId) {
  if (ttsPrefetchCache.has(indice)) {
    const p = ttsPrefetchCache.get(indice);
    ttsPrefetchCache.delete(indice);
    return p;
  }
  return window.AmoxcalliPiperTTS.sintetizarWavUrl(ttsFragmentos[indice].texto, {
    shouldAbort: () => sesionId !== ttsSessionId,
  });
}

async function hablarFragmentoPiper(indice, sesionId) {
  if (sesionId !== ttsSessionId || ttsEstadoLectura === "idle") return;
  if (indice >= ttsFragmentos.length) {
    finalizarLecturaPaginaTts(sesionId);
    return;
  }

  const fragmento = ttsFragmentos[indice];
  marcarBloqueLecturaTts(fragmento.el);

  let resultado = null;
  ttsSintetizandoPiper = true;
  try {
    resultado = await obtenerAudioFragmentoPiper(indice, sesionId);
  } catch (_) {
    if (sesionId === ttsSessionId) ttsSintetizandoPiper = false;
    if (sesionId !== ttsSessionId) return;
    reportarErrorSintesisTts("piper-synthesis-failed", obtenerVocesDisponiblesTts(), false);
    return;
  }
  if (sesionId === ttsSessionId) {
    ttsSintetizandoPiper = false;
  }

  if (sesionId !== ttsSessionId || ttsEstadoLectura === "idle") {
    if (resultado && resultado.url) {
      try { URL.revokeObjectURL(resultado.url); } catch (_) {}
    }
    return;
  }

  if (!resultado || !resultado.url) {
    ttsIndiceActual = indice + 1;
    await hablarFragmentoPiper(ttsIndiceActual, sesionId);
    return;
  }

  limpiarAudioActualTts();
  const audio = new Audio(resultado.url);
  audio.preservesPitch = true;
  audio.playbackRate = ttsVelocidad;
  ttsAudioActual = audio;
  ttsAudioUrlActual = resultado.url;

  audio.onended = () => {
    if (sesionId !== ttsSessionId || ttsEstadoLectura !== "speaking" || ttsAudioActual !== audio) {
      return;
    }
    limpiarAudioActualTts();
    ttsIndiceActual = indice + 1;
    hablarFragmentoPiper(ttsIndiceActual, sesionId);
  };

  audio.onerror = () => {
    if (sesionId !== ttsSessionId || ttsAudioActual !== audio) return;
    limpiarAudioActualTts();
    reportarErrorSintesisTts("audio-playback", obtenerVocesDisponiblesTts(), false);
  };

  precargarFragmentoPiper(indice + 1, sesionId);

  if (ttsEstadoLectura === "paused") {
    return;
  }

  try {
    await audio.play();
  } catch (err) {
    if (sesionId !== ttsSessionId || ttsAudioActual !== audio) return;
    const nombreErr = err && err.name ? err.name : "";
    if (nombreErr === "AbortError") return;
    if (nombreErr === "NotAllowedError") {
      ttsEstadoLectura = "paused";
      actualizarInterfazVozAlta();
      mostrarToast("El navegador bloqueó el audio; pulsa Reanudar");
      return;
    }
    reportarErrorSintesisTts("audio-playback", obtenerVocesDisponiblesTts(), false);
  }
}

function hablarFragmentoTts(indice, sesionId, opciones = {}) {
  if (sesionId !== ttsSessionId || ttsEstadoLectura !== "speaking") return;
  if (indice >= ttsFragmentos.length) {
    finalizarLecturaPaginaTts(sesionId);
    return;
  }

  const fragmento = ttsFragmentos[indice];
  marcarBloqueLecturaTts(fragmento.el);

  const sinForzarVoz = Boolean(opciones.sinForzarVoz);
  const utterance = new SpeechSynthesisUtterance(fragmento.texto);
  if (!sinForzarVoz) {
    if (ttsVozSeleccionada) {
      utterance.voice = ttsVozSeleccionada;
    }
    utterance.lang = (ttsVozSeleccionada && ttsVozSeleccionada.lang) || "es-MX";
  }
  utterance.rate = ttsVelocidad;
  ttsUtteranceActual = utterance;

  utterance.onend = () => {
    if (sesionId !== ttsSessionId || ttsEstadoLectura !== "speaking" || ttsUtteranceActual !== utterance) {
      return;
    }
    ttsIndiceActual += 1;
    hablarFragmentoTts(ttsIndiceActual, sesionId);
  };

  utterance.onerror = (ev) => {
    if (sesionId !== ttsSessionId || ttsUtteranceActual !== utterance) return;
    const tipoError = ev && ev.error ? ev.error : "";
    if (tipoError === "interrupted" || tipoError === "canceled") return;

    if (utterance.voice) {
      ttsVocesFallidas.add(obtenerClaveVozTts(utterance.voice));
    }

    const vocesActuales = obtenerVocesDisponiblesTts();
    if (!sinForzarVoz) {
      const vozAlternativa = buscarVozEspanolNoFallida(vocesActuales);
      if (vozAlternativa) {
        ttsVozSeleccionada = vozAlternativa;
        actualizarVozTtsPreferida(false);
        ttsUtteranceActual = null;
        try { window.speechSynthesis.cancel(); } catch (_) {}
        hablarFragmentoTts(indice, sesionId, { sinForzarVoz: false });
        return;
      }
    }

    if (!opciones.reintentadoSimple) {
      ttsUtteranceActual = null;
      try { window.speechSynthesis.cancel(); } catch (_) {}
      hablarFragmentoTts(indice, sesionId, { sinForzarVoz: true, reintentadoSimple: true });
      return;
    }

    reportarErrorSintesisTts(tipoError, vocesActuales, true);
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    reportarErrorSintesisTts(err && err.name ? err.name : "synthesis-failed", obtenerVocesDisponiblesTts(), true);
  }
}

function reportarErrorSintesisTts(tipoError, vocesActuales, permitirRespaldoPiper = true) {
  if (
    permitirRespaldoPiper &&
    ttsEstadoPiper &&
    ttsEstadoPiper.disponible &&
    soportaMotorPiperNavegador() &&
    ttsMotorActivo !== "piper" &&
    ttsFragmentos[ttsIndiceActual]
  ) {
    ttsUtteranceActual = null;
    if (soportaSpeechSynthesis()) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    ttsMotorActivo = "piper";
    ttsSessionId += 1;
    mostrarToast("Usando voz neuronal offline...");
    arrancarLecturaPiperDesde(ttsIndiceActual, ttsSessionId);
    return;
  }

  const errorNormalizado = tipoError || "synthesis-failed";
  let toastMsg = "No se pudo reproducir la síntesis de voz en este navegador";

  if (errorNormalizado === "piper-load-failed" || errorNormalizado === "piper-synthesis-failed" || errorNormalizado === "audio-playback") {
    ttsAvisoPersistente = {
      badge: "Error audio",
      info: "No se pudo iniciar la voz neuronal offline en este navegador.",
      esWarning: true,
    };
    toastMsg = "No se pudo reproducir el audio de lectura neuronal";
  } else if (!vocesActuales || vocesActuales.length === 0) {
    ttsAvisoPersistente = {
      badge: "Sin voces",
      info: "Sin voces de texto a voz en este navegador (en Linux requiere speech-dispatcher/espeak-ng o edición Medio/Completo con voz neuronal).",
      esWarning: true,
    };
    toastMsg = "Este navegador no tiene voces instaladas para lectura en voz alta";
  } else if (errorNormalizado === "not-allowed") {
    ttsAvisoPersistente = null;
    toastMsg = "El navegador bloqueó el audio; pulsa Leer nuevamente";
  } else if (errorNormalizado === "network") {
    ttsAvisoPersistente = {
      badge: "Sin conexión",
      info: "La voz elegida requiere conexión a internet y no hay una voz local disponible.",
      esWarning: true,
    };
    toastMsg = "La voz seleccionada requiere conexión a internet";
  } else {
    ttsAvisoPersistente = {
      badge: "No disponible",
      info: `El motor de voz del navegador devolvió "${errorNormalizado}".`,
      esWarning: true,
    };
    toastMsg = `No se pudo reproducir la síntesis de voz (${errorNormalizado})`;
  }

  detenerLecturaVozAlta({ silencioso: true, conservarAviso: Boolean(ttsAvisoPersistente) });
  mostrarToast(toastMsg);
}

function pausarLecturaVozAlta() {
  if (!soportaLecturaVozAlta() || ttsEstadoLectura !== "speaking") return;
  ttsEstadoLectura = "paused";
  if (ttsMotorActivo === "piper") {
    if (ttsAudioActual) {
      try { ttsAudioActual.pause(); } catch (_) {}
    }
  } else if (soportaSpeechSynthesis() && typeof window.speechSynthesis.pause === "function") {
    try { window.speechSynthesis.pause(); } catch (_) {}
  }
  actualizarInterfazVozAlta();
}

function reanudarLecturaVozAlta() {
  if (!soportaLecturaVozAlta() || ttsEstadoLectura !== "paused") return;
  ttsEstadoLectura = "speaking";
  actualizarInterfazVozAlta();

  if (ttsMotorActivo === "piper") {
    if (ttsAudioActual) {
      ttsAudioActual.playbackRate = ttsVelocidad;
      ttsAudioActual.play().catch((err) => {
        if (err && err.name === "AbortError") return;
        ttsEstadoLectura = "paused";
        actualizarInterfazVozAlta();
      });
    } else if (!ttsCargandoMotor && !ttsSintetizandoPiper && ttsFragmentos[ttsIndiceActual]) {
      hablarFragmentoPiper(ttsIndiceActual, ttsSessionId);
    }
    return;
  }

  if (!soportaSpeechSynthesis()) return;
  if (typeof window.speechSynthesis.resume === "function") {
    try { window.speechSynthesis.resume(); } catch (_) {}
  }

  if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending && ttsFragmentos[ttsIndiceActual]) {
    ttsSessionId += 1;
    ttsUtteranceActual = null;
    hablarFragmentoTts(ttsIndiceActual, ttsSessionId);
  }
}

function cambiarVelocidadVozAlta(nuevaVelocidad) {
  ttsVelocidad = Math.max(0.5, Math.min(2, nuevaVelocidad));
  document.querySelectorAll(".tts-rate-btn").forEach((btn) => {
    const val = parseFloat(btn.dataset.ttsRate || "1");
    btn.classList.toggle("active", Math.abs(val - ttsVelocidad) < 0.01);
  });

  if (ttsMotorActivo === "piper") {
    if (ttsAudioActual) {
      ttsAudioActual.playbackRate = ttsVelocidad;
    }
    return;
  }

  if (!soportaSpeechSynthesis()) return;
  if (ttsEstadoLectura === "speaking" && ttsFragmentos[ttsIndiceActual]) {
    ttsSessionId += 1;
    ttsUtteranceActual = null;
    try { window.speechSynthesis.cancel(); } catch (_) {}
    hablarFragmentoTts(ttsIndiceActual, ttsSessionId);
  } else if (ttsEstadoLectura === "paused") {
    ttsSessionId += 1;
    ttsUtteranceActual = null;
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
}

function finalizarLecturaPaginaTts(sesionId) {
  if (sesionId !== ttsSessionId) return;
  ttsSessionId += 1;
  ttsCargandoMotor = false;
  ttsSintetizandoPiper = false;
  ttsEstadoLectura = "idle";
  ttsFragmentos = [];
  ttsIndiceActual = 0;
  ttsUtteranceActual = null;
  limpiarAudioActualTts();
  limpiarPrefetchTts();
  limpiarResaltadoBloqueTts();
  actualizarInterfazVozAlta("Finalizado");
}

function detenerLecturaVozAlta(opciones) {
  const estabaActivo =
    ttsHaIniciadoLectura ||
    ttsCargandoMotor ||
    ttsSintetizandoPiper ||
    ttsEstadoLectura !== "idle" ||
    ttsUtteranceActual !== null ||
    ttsAudioActual !== null;

  if (!opciones || !opciones.conservarAviso) {
    ttsAvisoPersistente = null;
  }

  ttsSessionId += 1;
  ttsCargandoMotor = false;
  ttsSintetizandoPiper = false;
  ttsEstadoLectura = "idle";
  ttsHaIniciadoLectura = false;
  ttsFragmentos = [];
  ttsIndiceActual = 0;
  ttsUtteranceActual = null;
  limpiarAudioActualTts();
  limpiarPrefetchTts();
  limpiarResaltadoBloqueTts();

  if (
    soportaSpeechSynthesis() &&
    (estabaActivo ||
      window.speechSynthesis.speaking ||
      window.speechSynthesis.pending ||
      window.speechSynthesis.paused)
  ) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  actualizarInterfazVozAlta();
}

function actualizarInterfazVozAlta(estadoEtiquetaOpcional) {
  const btnPrincipal = document.getElementById("btn-voz-alta");
  const badge = document.getElementById("tts-estado-badge");
  const btnPlayPause = document.getElementById("btn-tts-play-pause");
  const iconoPlayPause = document.getElementById("icono-tts-play-pause");
  const labelPlayPause = document.getElementById("label-tts-play-pause");
  const btnStop = document.getElementById("btn-tts-stop");
  const infoEl = document.getElementById("tts-voz-info");

  if (!btnPrincipal || !badge || !btnPlayPause || !iconoPlayPause || !labelPlayPause || !btnStop) {
    return;
  }

  if (ttsEstadoLectura === "speaking") {
    btnPrincipal.classList.add("is-speaking");
    btnPrincipal.classList.remove("is-paused");
    btnPrincipal.title = ttsCargandoMotor ? "Preparando lectura neuronal" : "Lectura en voz alta (leyendo)";
    badge.textContent = estadoEtiquetaOpcional || (ttsCargandoMotor ? "Preparando..." : "Leyendo");
    badge.classList.add("active");
    badge.classList.remove("warning");
    if (infoEl) infoEl.classList.remove("is-warning");
    iconoPlayPause.innerHTML = SVG_TTS_PAUSE;
    labelPlayPause.textContent = ttsCargandoMotor ? "Cargando..." : "Pausar";
    btnPlayPause.title = ttsCargandoMotor ? "Cargando modelo neuronal" : "Pausar lectura en voz alta";
    btnPlayPause.disabled = ttsCargandoMotor;
    btnStop.disabled = false;
  } else if (ttsEstadoLectura === "paused") {
    btnPrincipal.classList.remove("is-speaking");
    btnPrincipal.classList.add("is-paused");
    btnPrincipal.title = "Lectura en voz alta (en pausa)";
    badge.textContent = "En pausa";
    badge.classList.add("active");
    badge.classList.remove("warning");
    iconoPlayPause.innerHTML = SVG_TTS_PLAY;
    labelPlayPause.textContent = "Reanudar";
    btnPlayPause.title = "Reanudar lectura en voz alta";
    btnPlayPause.disabled = false;
    btnStop.disabled = false;
  } else {
    btnPrincipal.classList.remove("is-speaking", "is-paused");
    btnPrincipal.title = "Lectura en voz alta offline (Ola 1)";
    const avisoActivo = !estadoEtiquetaOpcional && ttsAvisoPersistente;
    badge.textContent = estadoEtiquetaOpcional || (avisoActivo ? avisoActivo.badge : "Listo");
    badge.classList.remove("active");
    badge.classList.toggle("warning", Boolean(avisoActivo && avisoActivo.esWarning));
    if (infoEl && avisoActivo && avisoActivo.info) {
      infoEl.textContent = avisoActivo.info;
      infoEl.classList.toggle("is-warning", Boolean(avisoActivo.esWarning));
    }
    iconoPlayPause.innerHTML = SVG_TTS_PLAY;
    labelPlayPause.textContent = "Leer";
    btnPlayPause.title = "Iniciar lectura en voz alta";
    btnPlayPause.disabled = false;
    btnStop.disabled = true;
  }
}
