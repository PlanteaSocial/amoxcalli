(function (global) {
  "use strict";

  const scriptsCargados = new Map();
  let estadoRemotoCache = null;
  let estadoPromesaEnCurso = null;
  let cargaPromesaEnCurso = null;

  let ortSession = null;
  let modelConfig = null;
  let phonemizeWasmModule = null;
  let phonemizeWasmBytes = null;
  let phonemizeDataBuf = null;
  let colaSerializada = Promise.resolve();

  function cargarScriptSiFalta(src, verificarGlobal) {
    if (typeof verificarGlobal === "function" && verificarGlobal()) {
      return Promise.resolve();
    }
    if (scriptsCargados.has(src)) {
      return scriptsCargados.get(src);
    }

    const promesa = new Promise((resolve, reject) => {
      const existente = document.querySelector(`script[data-amoxcalli-tts-src="${src}"]`);
      if (existente && existente.dataset.loaded === "1") {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.amoxcalliTtsSrc = src;
      script.onload = () => {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = () => {
        scriptsCargados.delete(src);
        script.remove();
        reject(new Error(`No se pudo cargar el script local ${src}`));
      };
      document.head.appendChild(script);
    });

    scriptsCargados.set(src, promesa);
    return promesa;
  }

  async function fetchArrayBufferLocal(url, etiqueta) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Error al cargar ${etiqueta} (${res.status})`);
    }
    return res.arrayBuffer();
  }

  async function consultarDisponibilidad(forzar = false) {
    if (!forzar && estadoRemotoCache) {
      return estadoRemotoCache;
    }
    if (!forzar && estadoPromesaEnCurso) {
      return estadoPromesaEnCurso;
    }

    estadoPromesaEnCurso = fetch("/api/tts/estado", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((datos) => {
        estadoRemotoCache = datos;
        return datos;
      })
      .catch(() => ({
        disponible: false,
        motor: "piper-wasm",
        modelo: null,
        idioma: null,
        etiqueta: null,
        archivos: null,
      }))
      .finally(() => {
        estadoPromesaEnCurso = null;
      });

    return estadoPromesaEnCurso;
  }

  function estaListoEnMemoria() {
    return Boolean(ortSession && modelConfig && phonemizeDataBuf);
  }

  async function asegurarCargado(archivos, onFase) {
    if (estaListoEnMemoria()) {
      return;
    }
    if (cargaPromesaEnCurso) {
      return cargaPromesaEnCurso;
    }
    if (!archivos) {
      throw new Error("Configuración del motor neuronal no disponible");
    }

    cargaPromesaEnCurso = (async () => {
      if (typeof onFase === "function") onFase("descargando");

      const [resConfig, modeloBuf, wasmBuf, dataBuf] = await Promise.all([
        fetch(archivos.config, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} al leer config de voz`);
          return r.json();
        }),
        fetchArrayBufferLocal(archivos.modelo, "modelo neuronal"),
        fetchArrayBufferLocal(archivos.phonemizeWasm, "módulo fonemizador WASM"),
        fetchArrayBufferLocal(archivos.phonemizeData, "datos fonéticos eSpeak"),
        cargarScriptSiFalta(archivos.ortJs, () => typeof global.ort !== "undefined"),
        cargarScriptSiFalta(archivos.phonemizeJs, () => typeof global.createPiperPhonemize === "function"),
      ]);

      if (typeof global.ort === "undefined" || typeof global.createPiperPhonemize !== "function") {
        throw new Error("Inicialización incompleta de Piper/ONNX Runtime");
      }

      if (typeof onFase === "function") onFase("inicializando");

      // Un solo hilo evita requerir COOP/COEP y protege el visor PDF en iframe
      global.ort.env.wasm.numThreads = 1;
      global.ort.env.wasm.simd = true;
      global.ort.env.wasm.proxy = false;
      global.ort.env.wasm.wasmPaths = {
        "ort-wasm-simd.wasm": archivos.ortWasmSimd,
      };

      const session = await global.ort.InferenceSession.create(modeloBuf, {
        executionProviders: ["wasm"],
      });

      modelConfig = resConfig;
      phonemizeWasmBytes = wasmBuf;
      phonemizeWasmModule = null;
      phonemizeDataBuf = dataBuf;
      ortSession = session;
    })().catch((err) => {
      cargaPromesaEnCurso = null;
      throw err;
    });

    return cargaPromesaEnCurso;
  }

  function crearOpcionesWasmPhonemize(modOpts) {
    if (phonemizeWasmBytes) {
      modOpts.wasmBinary = new Uint8Array(phonemizeWasmBytes);
    }
  }

  async function fonemizarTexto(texto, espeakVoice) {
    const errores = [];
    let phonemeIds = null;

    const opts = {
      print: (linea) => {
        if (phonemeIds !== null) return;
        try {
          const parsed = JSON.parse(linea);
          if (Array.isArray(parsed.phoneme_ids)) {
            phonemeIds = parsed.phoneme_ids;
          }
        } catch {
          // Ignorar líneas informativas que no sean JSON de fonemas
        }
      },
      printErr: (msg) => {
        errores.push(String(msg));
      },
      getPreloadedPackage: () => phonemizeDataBuf.slice(0),
      locateFile: (url) => {
        if (estadoRemotoCache && estadoRemotoCache.archivos) {
          if (url.endsWith(".wasm")) return estadoRemotoCache.archivos.phonemizeWasm;
          if (url.endsWith(".data")) return estadoRemotoCache.archivos.phonemizeData;
        }
        return url;
      },
    };
    crearOpcionesWasmPhonemize(opts);

    const mod = await global.createPiperPhonemize(opts);
    mod.callMain([
      "-l",
      espeakVoice || "es-419",
      "--input",
      JSON.stringify([{ text: texto }]),
      "--espeak_data",
      "/espeak-ng-data",
    ]);

    if (!Array.isArray(phonemeIds)) {
      throw new Error(`Error al fonemizar texto: ${errores.join(" | ") || "sin salida"}`);
    }
    return phonemeIds;
  }

  function codificarPcmAWavBlob(pcmFloat32, sampleRate) {
    const numSamples = pcmFloat32.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const escribirAscii = (offset, str) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    escribirAscii(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    escribirAscii(8, "WAVE");
    escribirAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    escribirAscii(36, "data");
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i += 1) {
      const clamped = Math.max(-1, Math.min(1, pcmFloat32[i]));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  function normalizarTextoLectura(texto) {
    return String(texto || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function ejecutarSintesisInterna(texto, shouldAbort) {
    if (typeof shouldAbort === "function" && shouldAbort()) {
      return null;
    }
    const textoLimpio = normalizarTextoLectura(texto);
    if (!textoLimpio || !/[\p{L}\p{N}]/u.test(textoLimpio)) {
      return null;
    }

    const estado = await consultarDisponibilidad();
    if (!estado || !estado.disponible || !estado.archivos) {
      throw new Error("Respaldo neuronal no disponible en esta edición");
    }
    await asegurarCargado(estado.archivos);

    if (typeof shouldAbort === "function" && shouldAbort()) {
      return null;
    }

    const vozEspeak = (modelConfig.espeak && modelConfig.espeak.voice) || "es-419";
    const phonemeIds = await fonemizarTexto(textoLimpio, vozEspeak);
    if (!phonemeIds || phonemeIds.length === 0) {
      return null;
    }

    if (typeof shouldAbort === "function" && shouldAbort()) {
      return null;
    }

    const noiseScale = modelConfig.inference ? modelConfig.inference.noise_scale : 0.667;
    const lengthScale = modelConfig.inference ? modelConfig.inference.length_scale : 1.0;
    const noiseW = modelConfig.inference ? modelConfig.inference.noise_w : 0.8;
    const sampleRate = (modelConfig.audio && modelConfig.audio.sample_rate) || 22050;

    const feeds = {
      input: new global.ort.Tensor("int64", BigInt64Array.from(phonemeIds.map((id) => BigInt(id))), [1, phonemeIds.length]),
      input_lengths: new global.ort.Tensor("int64", BigInt64Array.from([BigInt(phonemeIds.length)]), [1]),
      scales: new global.ort.Tensor("float32", Float32Array.from([noiseScale, lengthScale, noiseW]), [3]),
    };

    if (modelConfig.speaker_id_map && Object.keys(modelConfig.speaker_id_map).length > 0) {
      feeds.sid = new global.ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
    }

    const salida = await ortSession.run(feeds);
    if (typeof shouldAbort === "function" && shouldAbort()) {
      return null;
    }

    const audioTensor = salida.output || Object.values(salida)[0];
    const pcm = audioTensor && audioTensor.data ? audioTensor.data : null;
    if (!pcm || pcm.length === 0) {
      return null;
    }

    const wavBlob = codificarPcmAWavBlob(pcm, sampleRate);
    const url = URL.createObjectURL(wavBlob);
    return {
      url,
      bytes: wavBlob.size,
      durationEstimateSec: pcm.length / sampleRate,
    };
  }

  function sintetizarWavUrl(texto, opciones) {
    const shouldAbort = opciones && opciones.shouldAbort;
    const tarea = colaSerializada.then(() => ejecutarSintesisInterna(texto, shouldAbort));
    colaSerializada = tarea.catch(() => null);
    return tarea;
  }

  global.AmoxcalliPiperTTS = {
    consultarDisponibilidad,
    estaListoEnMemoria,
    asegurarCargado,
    sintetizarWavUrl,
  };
})(window);
