let eventoInstalacionDiferido = null;
let modoCamaraActual = 'environment';
let streamCamaraActivo = null;
let solicitudCamara = 0;

const elementoVideo = document.getElementById('visor-camara');
const estadoCamara = document.getElementById('estado-camara');
const mensajeVideo = document.getElementById('mensaje-video');
const botonAlternar = document.getElementById('btn-alternar-camara');
const botonApagar = document.getElementById('btn-apagar-camara');
const botonConfirmarPermiso = document.getElementById('btn-confirmar-permiso');

function esDispositivoIOS() {
    const agente = navigator.userAgent || '';
    const plataforma = navigator.platform || '';
    const esIPadOS = plataforma === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(agente) || esIPadOS;
}

function estaEnModoInstalado() {
    const consulta = window.matchMedia ? window.matchMedia('(display-mode: standalone)').matches : false;
    return window.navigator.standalone === true || consulta;
}

function verificarEntornoIOS() {
    const guiaIOS = document.getElementById('instrucciones-ios');
    const guiaInstalacion = document.getElementById('instrucciones-instalacion');
    if (esDispositivoIOS() && !estaEnModoInstalado()) {
        guiaIOS.hidden = false;
    } else if (!estaEnModoInstalado() && !eventoInstalacionDiferido) {
        guiaInstalacion.hidden = false;
    }
}

function actualizarEstado(mensaje, camaraActiva = false) {
    estadoCamara.textContent = mensaje;
    mensajeVideo.hidden = camaraActiva;
    botonAlternar.disabled = !camaraActiva;
    botonApagar.disabled = !camaraActiva;
}

function detenerCamaraActiva() {
    solicitudCamara += 1;
    const streamAnterior = streamCamaraActivo;
    streamCamaraActivo = null;

    if (streamAnterior) {
        streamAnterior.getTracks().forEach((pista) => pista.stop());
    }

    if (elementoVideo.srcObject) {
        const streamEnVideo = elementoVideo.srcObject;
        if (streamEnVideo !== streamAnterior) {
            streamEnVideo.getTracks().forEach((pista) => pista.stop());
        }
        elementoVideo.srcObject = null;
    }
}

function obtenerMensajeErrorCamara(error) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return 'No se concedió el permiso de cámara. Revisa los ajustes del navegador.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return 'No se encontró una cámara disponible en este dispositivo.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        return 'La cámara está ocupada o no pudo iniciarse. Cierra otras aplicaciones que la estén usando e inténtalo de nuevo.';
    }
    return 'No se pudo iniciar la cámara. Intenta de nuevo.';
}

function iniciarCamara(modo) {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        actualizarEstado('La cámara requiere HTTPS y un navegador compatible.');
        return Promise.resolve();
    }

    // En iOS se libera el sensor antes de solicitar la otra lente.
    detenerCamaraActiva();
    const idSolicitud = solicitudCamara;
    actualizarEstado('Solicitando acceso a la cámara…');

    return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: modo } }
    }).then((stream) => {
        if (idSolicitud !== solicitudCamara) {
            stream.getTracks().forEach((pista) => pista.stop());
            return null;
        }

        streamCamaraActivo = stream;
        elementoVideo.srcObject = stream;
        return elementoVideo.play().then(() => {
            if (idSolicitud !== solicitudCamara) {
                stream.getTracks().forEach((pista) => pista.stop());
                return null;
            }
            actualizarEstado(modo === 'environment' ? 'Cámara trasera encendida' : 'Cámara frontal encendida', true);
            return stream;
        });
    }).catch((error) => {
        if (idSolicitud !== solicitudCamara) return null;
        detenerCamaraActiva();
        actualizarEstado(obtenerMensajeErrorCamara(error));
        return null;
    }).finally(() => {
        // La operación de encendido terminó; los controles reflejan el estado actual del stream.
        if (idSolicitud === solicitudCamara && !streamCamaraActivo) {
            botonAlternar.disabled = true;
            botonApagar.disabled = true;
        }
    });
}

// Primer paso: mostrar el motivo antes de solicitar el permiso del sistema.
document.getElementById('btn-preparar-camara').addEventListener('click', () => {
    document.getElementById('aviso-permiso').hidden = false;
    botonConfirmarPermiso.focus();
});

// Segundo paso: la llamada al hardware ocurre solo tras la confirmación explícita.
botonConfirmarPermiso.addEventListener('click', () => {
    document.getElementById('aviso-permiso').hidden = true;
    iniciarCamara(modoCamaraActual);
});

botonAlternar.addEventListener('click', () => {
    modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
    iniciarCamara(modoCamaraActual);
});

botonApagar.addEventListener('click', () => {
    detenerCamaraActiva();
    elementoVideo.srcObject = null;
    actualizarEstado('Cámara apagada');
});

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    eventoInstalacionDiferido = event;
    const botonInstalar = document.getElementById('btn-instalar');
    botonInstalar.hidden = false;
    document.getElementById('instrucciones-instalacion').hidden = true;
});

document.getElementById('btn-instalar').addEventListener('click', () => {
    if (!eventoInstalacionDiferido) return;

    const eventoActual = eventoInstalacionDiferido;
    Promise.resolve(eventoActual.prompt())
        .then(() => eventoActual.userChoice)
        .then(() => {
            // La respuesta ya fue recibida; la limpieza se realiza en finally.
        })
        .catch(() => {
            document.getElementById('instrucciones-instalacion').hidden = false;
        })
        .finally(() => {
            eventoInstalacionDiferido = null;
            document.getElementById('btn-instalar').hidden = true;
        });
});

window.addEventListener('appinstalled', () => {
    document.getElementById('btn-instalar').hidden = true;
    document.getElementById('instrucciones-instalacion').hidden = true;
});

verificarEntornoIOS();

if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {
            // La cámara sigue funcionando aunque el registro offline no esté disponible.
        });
    });
}
