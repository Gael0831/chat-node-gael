const socket = io();

const login = document.getElementById("login");
const chat = document.getElementById("chat");
const formLogin = document.getElementById("form-login");
const nombre = document.getElementById("nombre");
const errorLogin = document.getElementById("error-login");
const miUsuario = document.getElementById("mi-usuario");
const estado = document.getElementById("estado");
const usuarios = document.getElementById("usuarios");
const mensajes = document.getElementById("mensajes");
const escribiendo = document.getElementById("escribiendo");
const formMensaje = document.getElementById("form-mensaje");
const mensaje = document.getElementById("mensaje");
const btnEnviar = document.getElementById("btn-enviar");
const formArchivo = document.getElementById("form-archivo");
const archivo = document.getElementById("archivo");
const btnArchivo = document.getElementById("btn-archivo");
const errorChat = document.getElementById("error-chat");
const sonido = document.getElementById("sonido");

let usuarioActual = "";
let ingresado = false;
let subiendo = false;
let temporizador;
let contextoAudio;
const usuariosEscribiendo = new Map();

function actualizarControles() {
  const disponible = socket.connected && ingresado;
  btnEnviar.disabled = !disponible;
  btnArchivo.disabled = !disponible || subiendo;
}

function activarAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;

    contextoAudio ??= new Audio();
    contextoAudio.resume().catch(() => {});
  } catch {
    // El chat puede funcionar aunque el navegador no permita audio.
  }
}

function reproducirSonido() {
  if (!sonido.checked || !contextoAudio) return;
  if (contextoAudio.state !== "running") return;

  const oscilador = contextoAudio.createOscillator();
  const volumen = contextoAudio.createGain();
  const ahora = contextoAudio.currentTime;

  oscilador.type = "sine";
  oscilador.frequency.setValueAtTime(740, ahora);
  oscilador.frequency.setValueAtTime(990, ahora + 0.08);

  volumen.gain.setValueAtTime(0.08, ahora);
  volumen.gain.exponentialRampToValueAtTime(0.001, ahora + 0.2);

  oscilador.connect(volumen);
  volumen.connect(contextoAudio.destination);

  oscilador.start(ahora);
  oscilador.stop(ahora + 0.2);
}

function bajarConversacion() {
  mensajes.scrollTop = mensajes.scrollHeight;
}

function agregarAviso(texto) {
  const aviso = document.createElement("p");
  aviso.className = "aviso";
  aviso.textContent = texto;
  mensajes.appendChild(aviso);
  bajarConversacion();
}

function mostrarEscritura() {
  const nombres = [...usuariosEscribiendo.values()]
    .map((dato) => dato.usuario);

  escribiendo.textContent = nombres.length
    ? `${nombres.join(", ")} ${nombres.length === 1 ? "está" : "están"} escribiendo…`
    : "";
}

function detenerEscritura() {
  clearTimeout(temporizador);

  if (socket.connected && ingresado) {
    socket.emit("escribiendo", false);
  }
}

function ingresar(nombreUsuario) {
  ingresado = false;
  actualizarControles();

  socket.timeout(5000).emit(
    "ingresar",
    nombreUsuario,
    (error, respuesta) => {
      if (error || !respuesta?.ok) {
        const texto = error
          ? "No se pudo ingresar. Comprueba la conexión e intenta otra vez."
          : respuesta.error;

        if (chat.hidden) {
          errorLogin.textContent = texto;
        } else {
          errorChat.textContent = texto;
        }
        return;
      }

      usuarioActual = nombreUsuario;
      ingresado = true;
      errorLogin.textContent = "";
      errorChat.textContent = "";
      login.hidden = true;
      chat.hidden = false;
      miUsuario.textContent = `Conectado como: ${usuarioActual}`;
      estado.textContent = "Conectado";
      actualizarControles();
      mensaje.focus();
    }
  );
}

formLogin.addEventListener("submit", (evento) => {
  evento.preventDefault();

  const valor = nombre.value.trim();

  if (!valor) {
    errorLogin.textContent = "Escribe tu nombre.";
    return;
  }

  if (!socket.connected) {
    errorLogin.textContent = "Espera a que se conecte el servidor.";
    return;
  }

  activarAudio();
  ingresar(valor);
});

socket.on("connect", () => {
  estado.textContent = "Conectado";
  errorLogin.textContent = "";

  if (usuarioActual) {
    ingresar(usuarioActual);
  } else {
    actualizarControles();
  }
});

socket.on("disconnect", () => {
  ingresado = false;
  estado.textContent = "Desconectado. Intentando reconectar…";
  clearTimeout(temporizador);

  usuariosEscribiendo.forEach((dato) => clearTimeout(dato.timer));
  usuariosEscribiendo.clear();
  mostrarEscritura();
  usuarios.replaceChildren();
  actualizarControles();
});

socket.on("connect_error", () => {
  estado.textContent = "No se pudo conectar al servidor.";

  if (chat.hidden) {
    errorLogin.textContent =
      "No hay conexión. Comprueba que npm run dev siga funcionando.";
  }
});

socket.on("usuarios", (lista) => {
  usuarios.replaceChildren();

  lista.forEach((persona) => {
    const elemento = document.createElement("li");
    elemento.textContent =
      persona.nombre + (persona.id === socket.id ? " (tú)" : "");
    usuarios.appendChild(elemento);
  });
});

socket.on("aviso", agregarAviso);

socket.on("mensaje", (datos) => {
  const burbuja = document.createElement("article");
  burbuja.className = "mensaje";

  if (datos.socketId === socket.id) {
    burbuja.classList.add("propio");
  }

  const autor = document.createElement("span");
  autor.className = "autor";
  autor.textContent = datos.usuario;
  burbuja.appendChild(autor);

  if (datos.tipo === "archivo") {
    const enlace = document.createElement("a");
    enlace.href = datos.url;
    enlace.textContent = `Descargar: ${datos.nombre}`;
    enlace.download = datos.nombre;
    burbuja.appendChild(enlace);

    const detalle = document.createElement("p");
    detalle.textContent =
      `${(datos.tamaño / (1024 * 1024)).toFixed(2)} MB`;
    burbuja.appendChild(detalle);
  } else {
    const texto = document.createElement("p");
    texto.textContent = datos.texto;
    burbuja.appendChild(texto);
  }

  const hora = document.createElement("time");
  hora.dateTime = datos.fecha;
  hora.textContent = new Date(datos.fecha).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });

  burbuja.appendChild(hora);
  mensajes.appendChild(burbuja);
  bajarConversacion();
  reproducirSonido();
});

socket.on("escribiendo", (datos) => {
  const anterior = usuariosEscribiendo.get(datos.id);
  if (anterior) clearTimeout(anterior.timer);

  if (datos.activo) {
    const timer = setTimeout(() => {
      usuariosEscribiendo.delete(datos.id);
      mostrarEscritura();
    }, 2500);

    usuariosEscribiendo.set(datos.id, {
      usuario: datos.usuario,
      timer,
    });
  } else {
    usuariosEscribiendo.delete(datos.id);
  }

  mostrarEscritura();
});

mensaje.addEventListener("input", () => {
  if (!socket.connected || !ingresado) return;

  socket.emit("escribiendo", mensaje.value.trim().length > 0);
  clearTimeout(temporizador);
  temporizador = setTimeout(detenerEscritura, 1200);
});

mensaje.addEventListener("blur", detenerEscritura);

formMensaje.addEventListener("submit", (evento) => {
  evento.preventDefault();
  errorChat.textContent = "";

  if (!socket.connected || !ingresado) {
    errorChat.textContent = "Espera a recuperar la conexión.";
    return;
  }

  const texto = mensaje.value.trim();
  if (!texto) return;

  activarAudio();
  socket.emit("mensaje", texto);
  mensaje.value = "";
  detenerEscritura();
  mensaje.focus();
});

formArchivo.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  errorChat.textContent = "";

  if (subiendo) return;

  if (!socket.connected || !ingresado) {
    errorChat.textContent = "Espera a recuperar la conexión.";
    return;
  }

  const seleccionado = archivo.files[0];
  if (!seleccionado) return;

  if (seleccionado.size > 20 * 1024 * 1024) {
    errorChat.textContent = "El archivo supera el límite de 20 MB.";
    return;
  }

  activarAudio();

  const formulario = new FormData();
  formulario.append("archivo", seleccionado);

  subiendo = true;
  btnArchivo.textContent = "Subiendo…";
  actualizarControles();

  try {
    const respuesta = await fetch("/subir", {
      method: "POST",
      headers: { "x-socket-id": socket.id },
      body: formulario,
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(resultado.error || "No se pudo subir el archivo.");
    }

    archivo.value = "";
  } catch (error) {
    errorChat.textContent = error.message;
  } finally {
    subiendo = false;
    btnArchivo.textContent = "Compartir archivo";
    actualizarControles();
  }
});

sonido.addEventListener("change", () => {
  if (sonido.checked) activarAudio();
});

actualizarControles();