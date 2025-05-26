// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Para cargar variables de entorno desde .env

// --- Importar OpenAI en lugar de Google Generative AI ---
const OpenAI = require('openai');


const app = express();
const port = 3000; // Puedes cambiar el puerto si es necesario

// --- CONFIGURACIÓN ---
// !!! IMPORTANTE: USA variables de entorno para la API Key y credenciales de email !!!
// Asegúrate de que OPENAI_API_KEY esté en tu archivo .env
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_RECIPIENT = process.env.EMAIL_RECIPIENT || "jeremontoya1555@gmail.com";

// Modelo de OpenAI a usar (gpt-3.5-turbo es comparable a Gemini 1.5 Flash en costo/velocidad)
const MODEL_NAME = "gpt-3.5-turbo"; // Puedes cambiar a gpt-4 si necesitas más capacidad (y pagas más)

let knowledgeBaseText = ""; // Aquí almacenaremos el texto de la base de conocimiento

// --- Inicializar Cliente OpenAI ---
if (!OPENAI_API_KEY) {
    console.error("\n!!! ERROR CRÍTICO: No se encontró la variable de entorno OPENAI_API_KEY. Asegúrate de que esté configurada en tu archivo .env. !!!\n");
    process.exit(1); // Salir si no hay API Key
}

const openaiClient = new OpenAI({
    apiKey: OPENAI_API_KEY,
});


// Configurar Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // O tu proveedor de email
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public'))); // Servir archivos estáticos (CSS, JS)
app.use(express.json()); // Para parsear el cuerpo de las peticiones JSON
app.set('view engine', 'ejs'); // Configurar EJS como motor de plantillas
app.set('views', path.join(__dirname, 'views')); // Establecer el directorio de vistas

// --- FUNCIONES DE BASE DE CONOCIMIENTO ---
// (Estas funciones son las mismas, no cambian)
async function readTxt(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (error) {
        console.error(`Error al leer el archivo TXT ${filePath}:`, error.message);
        return null;
    }
}

async function readDocx(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value; // El texto extraído
    } catch (error) {
        console.error(`Error al leer el archivo DOCX ${filePath}:`, error.message);
        return null;
    }
}

async function loadKnowledgeBase(filePath) {
    if (!fs.existsSync(filePath)) {
         console.error(`Error: Archivo de base de conocimiento no encontrado en la ruta especificada: ${filePath}`);
         return false;
    }

    const fileExtension = path.extname(filePath).toLowerCase();
    let content = null;

    if (fileExtension === ".txt") {
        content = await readTxt(filePath);
    } else if (fileExtension === ".docx") {
        content = await readDocx(filePath);
    } else {
        console.error("Formato de archivo de base de conocimiento no soportado. Por favor, usa .txt o .docx");
        return false;
    }

    if (content) {
        knowledgeBaseText = content;
        console.log(`Base de conocimiento cargada exitosamente desde ${filePath} (${content.length} caracteres).`);
        return true;
    } else {
        console.error("No se pudo cargar la base de conocimiento.");
        return false;
    }
}

// --- RUTAS ---

// Ruta principal para servir la interfaz de chat
app.get('/', (req, res) => {
    // Puedes pasar variables EJS aquí si necesitas
    res.render('chat', { knowledgeBaseLoaded: knowledgeBaseText.length > 0 });
});

// Ruta para manejar los mensajes del chat
app.post('/chat', async (req, res) => {
    const userInput = req.body.message;

    if (!userInput) {
        return res.status(400).json({ error: "Mensaje vacío" });
    }

    if (knowledgeBaseText.length === 0) {
        return res.status(500).json({ error: "La base de conocimiento no está cargada en el servidor." });
    }

    try {
        // --- Construir el array de mensajes para OpenAI ---
        // El 'system' message establece el comportamiento y proporciona el contexto (base de conocimiento)
        // El 'user' message es la pregunta actual del usuario
        const messages = [
            {
                "role": "system",
                "content": `Eres un bot de soporte técnico amigable y servicial. Tu tarea es responder las preguntas de los usuarios basándote estrictamente en la siguiente base de conocimiento.

<base_de_conocimiento>
${knowledgeBaseText}
</base_de_conocimiento>

Instrucciones para responder:
1. Lee cuidadosamente la base de conocimiento y la pregunta del usuario.
2. Identifica la información relevante en la base de conocimiento que responda a la pregunta.
3. Formula una respuesta clara y concisa UTILIZANDO SOLO la información encontrada en la base de conocimiento.
4. Si la base de conocimiento contiene pasos o procedimientos, lístalos de forma clara y ordenada.
5. Si la base de conocimiento NO contiene la respuesta a la pregunta del usuario, o si no puedes encontrar información relevante, responde amablemente diciendo que la información solicitada no se encuentra en tu base de conocimiento y sugiere que contacten a un agente de soporte humano para recibir asistencia adicional. NO inventes respuestas ni uses conocimiento externo.
6. Mantén un tono profesional y servicial.`
            },
            {
                "role": "user",
                "content": userInput
            }
        ];

        // --- Llamar a la API de OpenAI ---
        const completion = await openaiClient.chat.completions.create({
            model: MODEL_NAME,
            messages: messages,
            temperature: 0.0, // Baja temperatura para respuestas más directas y basadas en la KB
            max_tokens: 500, // Limita la longitud de la respuesta si es necesario
            // Puedes añadir top_p, frequency_penalty, etc. si quieres ajustar más el comportamiento
        });

        // --- Extraer la respuesta del bot ---
        // La respuesta está en completion.choices[0].message.content
        const responseText = completion.choices[0].message.content;


        res.json({ response: responseText });

    } catch (error) {
        console.error("Error al comunicarse con la API de OpenAI:", error);
        let errorMessage = "Ocurrió un error al procesar tu solicitud con OpenAI.";
        // Añadir detalles de errores comunes de OpenAI si es posible
        if (error.response) {
             errorMessage += ` Código de estado: ${error.response.status}. Mensaje: ${error.response.data.error.message}`;
        } else if (error.message) {
             errorMessage += ` Mensaje: ${error.message}`;
        }
        res.status(500).json({ error: errorMessage });
    }
});

// Ruta para enviar el resumen del chat por correo
// (Esta ruta es la misma, no cambia)
app.post('/send-email', async (req, res) => {
    const chatSummary = req.body.summary; // El frontend enviará el contenido del chat

    if (!chatSummary) {
        return res.status(400).json({ error: "No hay contenido de chat para enviar." });
    }

     if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_RECIPIENT) {
         console.error("Credenciales de email o destinatario no configurados. No se puede enviar el correo.");
         return res.status(500).json({ error: "El servidor no tiene la configuración de email completa." });
     }

    const mailOptions = {
        from: EMAIL_USER, // Remitente
        to: EMAIL_RECIPIENT, // Destinatario (jeremontoya1555@gmail.com)
        subject: 'Resumen de Conversación del Bot de Soporte (OpenAI)', // Asunto del correo (modificado para indicar OpenAI)
        text: `Estimado equipo de soporte,\n\nAdjunto el resumen de una conversación del bot (OpenAI) con un usuario. Esto puede ayudar a entender el contexto si el usuario necesita asistencia adicional.\n\n--- Inicio de Conversación ---\n${chatSummary}\n--- Fin de Conversación ---\n\nSaludos,\nBot de Soporte`, // Cuerpo del correo (texto plano)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Correo enviado: ' + info.response);
        res.json({ success: true, message: "Resumen de chat enviado por correo." });
    } catch (error) {
        console.error('Error al enviar el correo:', error);
        res.status(500).json({ success: false, error: "Error al enviar el correo." });
    }
});


// --- INICIO DEL SERVIDOR ---

// Antes de iniciar el servidor, carga la base de conocimiento
const knowledgeBaseFilePath = path.join(__dirname, 'soporte.txt'); // <-- CAMBIA ESTO por la ruta real de tu archivo (.txt o .docx)

loadKnowledgeBase(knowledgeBaseFilePath)
    .then(loaded => {
        if (loaded) {
            app.listen(port, () => {
                console.log(`Servidor Express escuchando en http://localhost:${port}`);
                console.log(`Interfaz de chat (OpenAI) disponible en http://localhost:${port}`);
            });
        } else {
            console.error("No se pudo iniciar el servidor porque la base de conocimiento no se cargó.");
             console.log(`Verifica la ruta del archivo de base de conocimiento: ${knowledgeBaseFilePath}`);
             // Opcional: process.exit(1); si la KB es crítica para iniciar
             app.listen(port, () => {
                 console.warn(`Servidor iniciado en http://localhost:${port} PERO LA BASE DE CONOCIMIENTO NO PUDO CARGARSE.`);
             });
        }
    })
    .catch(err => {
        console.error("Error durante la carga inicial de la base de conocimiento:", err);
        process.exit(1); // Salir si hay un error grave al cargar la KB
    });