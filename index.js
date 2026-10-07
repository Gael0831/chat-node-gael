const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4000;
const carpetaArchivos = path.join(__dirname, "uploads");

fs.mkdirSync(carpetaArchivos, { recursive: true });

app.use(express.static(path.join(__dirname, "public")));

// Guardar archivos con nombres únicos.
const almacenamiento = multer.diskStorage({
  destination: carpetaArchivos,
  filename: (req, file, callback) => {
    callback(null, randomUUID());
  },
});

const subir = multer({
  storage: almacenamiento,
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
    fields: 0,
  },
});

// Datos de los archivos disponibles para descargar.
const archivos = new Map();

function crearMensaje(socket, datos) {
  return {
    id: randomUUID(),
    usuario: socket.data.usuario,
    socketId: socket.id,
    fecha: new Date().toISOString(),
    ...datos,
  };
}

function actualizarUsuarios() {
  const usuarios = [...io.sockets.sockets.values()]
    .filter((socket) => socket.data.usuario)
    .map((socket) => ({
      id: socket.id,
      nombre: socket.data.usuario,
    }));

  io.emit("usuarios", usuarios);
}

io.on("connection", (socket) => {
  socket.on("ingresar", (nombre, responder) => {
    const usuario =
      typeof nombre === "string" ? nombre.trim() : "";

    if (!usuario || usuario.length > 30) {
      if (typeof responder === "function") {
        responder({
          ok: false,
          error: "Escribe un nombre de entre 1 y 30 caracteres.",
        });
      }
      return;
    }

    const primeraEntrada = !socket.data.usuario;
    socket.data.usuario = usuario;

    if (typeof responder === "function") {
      responder({ ok: true });
    }

    if (primeraEntrada) {
      io.emit("aviso", `${usuario} ingresó al chat.`);
    }

    actualizarUsuarios();
  });

  socket.on("mensaje", (texto) => {
    if (!socket.data.usuario || typeof texto !== "string") return;

    const contenido = texto.trim();
    if (!contenido || contenido.length > 2000) return;

    io.emit(
      "mensaje",
      crearMensaje(socket, {
        tipo: "texto",
        texto: contenido,
      })
    );

    socket.broadcast.emit("escribiendo", {
      id: socket.id,
      usuario: socket.data.usuario,
      activo: false,
    });
  });

  socket.on("escribiendo", (activo) => {
    if (!socket.data.usuario) return;

    socket.broadcast.emit("escribiendo", {
      id: socket.id,
      usuario: socket.data.usuario,
      activo: activo === true,
    });
  });

  socket.on("disconnect", () => {
    if (!socket.data.usuario) return;

    io.emit("aviso", `${socket.data.usuario} salió del chat.`);
    io.emit("escribiendo", {
      id: socket.id,
      usuario: socket.data.usuario,
      activo: false,
    });

    actualizarUsuarios();
  });
});

// El cliente enviará su identificador en el encabezado x-socket-id.
app.post(
  "/subir",
  (req, res, next) => {
    const socket = io.sockets.sockets.get(req.get("x-socket-id"));

    if (!socket || !socket.data.usuario) {
      return res.status(401).json({
        error: "Primero debes ingresar al chat.",
      });
    }

    req.chatSocket = socket;
    next();
  },
  subir.single("archivo"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Selecciona un archivo.",
      });
    }

    const nombre = path
      .basename(req.file.originalname.replace(/\\/g, "/"))
      .replace(/[\r\n]/g, "")
      .slice(0, 180) || "archivo";

    archivos.set(req.file.filename, {
      ruta: req.file.path,
      nombre,
    });

    io.emit(
      "mensaje",
      crearMensaje(req.chatSocket, {
        tipo: "archivo",
        nombre,
        tamaño: req.file.size,
        url: `/archivos/${req.file.filename}`,
      })
    );

    res.json({ ok: true });
  }
);

// Descargar los adjuntos.
app.get("/archivos/:id", (req, res) => {
  const archivo = archivos.get(req.params.id);

  if (!archivo) {
    return res.status(404).send("Archivo no encontrado.");
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.download(archivo.ruta, archivo.nombre);
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "El archivo supera el límite de 20 MB."
          : "No se pudo subir el archivo. Envía uno a la vez.",
    });
  }

  console.error(error);
  res.status(500).json({ error: "Ocurrió un error en el servidor." });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Chat funcionando en http://localhost:${PORT}`);
});