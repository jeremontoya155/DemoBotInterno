// server.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const mammoth = require('mammoth');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const pdf = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIGURACIÓN ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_RECIPIENT = process.env.EMAIL_RECIPIENT || "jeremontoya1555@gmail.com";
const KNOWLEDGE_BASE_DIR = process.env.KNOWLEDGE_BASE_DIR || 'knowbase';

const EXCLUDED_EXTENSIONS = ['.fll', '.exe', '.dll', '.obj', '.vct', '.vcx', '.pjt', '.pjx', '.bak', '.tmp', '.bat', '.code-workspace', '.vbr', '.tbk'];

const MODEL_NAME = "gpt-3.5-turbo"; // Confirmado gpt-3.5-turbo

let knowledgeBaseChunks = []; // Aquí almacenaremos los chunks

// AJUSTES PARA CONTROL DE TOKENS Y COSTOS
const MAX_CHUNK_SIZE_CHARS = 750;  // Chunks más pequeños. Aprox 150-300 tokens por chunk.
                                   // Si 1 token ~2.5 chars, 750 chars ~ 300 tokens.
const MAX_CONTEXT_TOKENS_FOR_LLM_CHUNKS = 450; // LÍMITE DE TOKENS PARA LOS CHUNKS ENVIADOS
const NUM_RELEVANT_CHUNKS_TO_SEND = 2; // Intentar enviar 2-3 chunks, si caben.
                                       // 2 chunks * (750 chars / 2.5 chars_per_token) ~ 600 tokens.
                                       // La lógica getRelevantChunks se asegurará de no pasar de MAX_CONTEXT_TOKENS_FOR_LLM_CHUNKS.

const MAX_OUTPUT_TOKENS = 100; // Limitar la respuesta del bot para ahorrar costos de salida.

let conversationHistory = [];

// --- Inicializar Cliente OpenAI ---
if (!OPENAI_API_KEY) {
    console.error("\n!!! ERROR CRÍTICO: No se encontró OPENAI_API_KEY. !!!\n");
    process.exit(1);
}
const openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });

// Nodemailer
let transporter;
if (EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
} else {
    console.warn("Advertencia: Credenciales de email no configuradas.");
}

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- FUNCIONES DE BASE DE CONOCIMIENTO (CHUNKED) ---
async function readTxtOrMd(filePath) {
    try { return await fs.readFile(filePath, "utf8"); }
    catch (error) { console.error(`Error al leer TXT/MD ${filePath}:`, error.message); return null; }
}
async function readDocx(filePath) {
    try { const result = await mammoth.extractRawText({ path: filePath }); return result.value; }
    catch (error) { console.error(`Error al leer DOCX ${filePath}:`, error.message); return null; }
}
async function readPdf(filePath) {
    try { const dataBuffer = await fs.readFile(filePath); const data = await pdf(dataBuffer); return data.text; }
    catch (error) { console.error(`Error al leer PDF ${filePath}:`, error.message); return null; }
}

function createChunks(text, sourceFile, chunkSize = MAX_CHUNK_SIZE_CHARS) {
    const chunks = [];
    if (!text || typeof text !== 'string') return chunks;

    const paragraphs = text.split(/\n\s*\n/); 
    let currentChunkText = "";

    for (const paragraph of paragraphs) {
        const trimmedParagraph = paragraph.trim();
        if (!trimmedParagraph) continue;

        if ((currentChunkText + "\n" + trimmedParagraph).length > chunkSize && currentChunkText.length > 0) {
            chunks.push({ text: currentChunkText, source: sourceFile, charLength: currentChunkText.length });
            currentChunkText = trimmedParagraph;
        } else {
            currentChunkText = currentChunkText ? currentChunkText + "\n" + trimmedParagraph : trimmedParagraph;
        }
    }
    if (currentChunkText.length > 0) {
        chunks.push({ text: currentChunkText, source: sourceFile, charLength: currentChunkText.length });
    }
    return chunks;
}

async function loadAndChunkKnowledgeBase() {
    const kbPath = path.join(__dirname, KNOWLEDGE_BASE_DIR);
    console.log(`Buscando base de conocimiento en: ${kbPath}`);
    knowledgeBaseChunks = [];
    let filesProcessed = 0;
    let totalChars = 0;

    try {
        await fs.access(kbPath);
        const files = await fs.readdir(kbPath);

        if (files.length === 0) {
            console.warn(`El directorio '${KNOWLEDGE_BASE_DIR}' está vacío.`);
            return false;
        }

        for (const file of files) {
            const filePath = path.join(kbPath, file);
            const fileExtension = path.extname(filePath).toLowerCase();

            if (EXCLUDED_EXTENSIONS.includes(fileExtension)) {
                console.warn(`Archivo omitido (excluido): ${file}`);
                continue;
            }

            let content = null;
            console.log(`Procesando archivo para chunking: ${file}`);

            if (fileExtension === ".txt" || fileExtension === ".md") {
                content = await readTxtOrMd(filePath);
            } else if (fileExtension === ".docx") {
                content = await readDocx(filePath);
            } else if (fileExtension === ".pdf") {
                content = await readPdf(filePath);
            } else {
                console.warn(`Extensión no soportada '${file}', omitiendo.`);
                continue;
            }

            if (content) {
                const cleanContent = content.replace(/\x00/g, '');
                const chunksFromFile = createChunks(cleanContent, file);
                knowledgeBaseChunks.push(...chunksFromFile);
                filesProcessed++;
                totalChars += cleanContent.length;
            }
        }
    } catch (error) {
        if (error.code === 'ENOENT') { console.error(`Error: Directorio KB '${KNOWLEDGE_BASE_DIR}' no existe.`); }
        else { console.error(`Error al leer directorio KB ${kbPath}:`, error.message); }
        return false;
    }

    if (filesProcessed > 0) {
        console.log(`Base de conocimiento cargada y dividida en ${knowledgeBaseChunks.length} chunks desde ${filesProcessed} archivo(s).`);
        console.log(`Total caracteres procesados: ${totalChars}`);
        // Ordenar chunks por longitud de caracteres (los más pequeños primero) puede ser útil
        // si se quiere priorizar chunks más concisos al llenar el contexto.
        // knowledgeBaseChunks.sort((a, b) => a.charLength - b.charLength); 
        return true;
    } else {
        console.warn("No se pudo cargar contenido de la base de conocimiento para chunking.");
        return false;
    }
}

// Estimación de tokens (muy aproximada, ajusta CHARS_PER_TOKEN según tu contenido)
const CHARS_PER_TOKEN = 2.5; 
function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function getRelevantChunks(query, numChunksToConsider = NUM_RELEVANT_CHUNKS_TO_SEND * 2) { // Considerar más chunks inicialmente
    if (knowledgeBaseChunks.length === 0) return [];

    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);

    const scoredChunks = knowledgeBaseChunks.map(chunk => {
        let score = 0;
        const chunkTextLower = chunk.text.toLowerCase();
        for (const word of queryWords) {
            if (chunkTextLower.includes(word)) {
                score++;
            }
        }
        return { ...chunk, score };
    });

    scoredChunks.sort((a, b) => b.score - a.score);

    const topScoredChunks = scoredChunks.filter(chunk => chunk.score > 0).slice(0, numChunksToConsider);
    
    let selectedChunksForPrompt = [];
    let currentTotalTokens = 0;

    for (const chunk of topScoredChunks) {
        const chunkTokens = estimateTokens(chunk.text);
        if (currentTotalTokens + chunkTokens <= MAX_CONTEXT_TOKENS_FOR_LLM_CHUNKS) {
            selectedChunksForPrompt.push(chunk.text);
            currentTotalTokens += chunkTokens;
        } else {
            // Si el primer chunk ya es demasiado grande, podríamos intentar truncarlo o no enviar nada
            if (selectedChunksForPrompt.length === 0 && chunkTokens > MAX_CONTEXT_TOKENS_FOR_LLM_CHUNKS) {
                console.warn(`El chunk más relevante (${chunk.source}, ${chunkTokens} tokens) excede MAX_CONTEXT_TOKENS_FOR_LLM_CHUNKS (${MAX_CONTEXT_TOKENS_FOR_LLM_CHUNKS}). No se enviará contexto.`);
                break;
            }
            break; 
        }
        if (selectedChunksForPrompt.length >= NUM_RELEVANT_CHUNKS_TO_SEND) break; // No enviar más de NUM_RELEVANT_CHUNKS_TO_SEND
    }
    
    console.log(`Chunks con score > 0: ${topScoredChunks.length}. Chunks seleccionados para prompt: ${selectedChunksForPrompt.length}. Tokens de chunks: ~${currentTotalTokens}`);
    return selectedChunksForPrompt;
}

function addMessageToHistory(sessionId, role, content) { /* ... (igual) ... */ 
    let session = conversationHistory.find(s => s.id === sessionId);
    if (!session) {
        if (conversationHistory.length >= 10) conversationHistory.shift();
        session = { id: sessionId, messages: [] };
        conversationHistory.push(session);
    }
    session.messages.push({ role, content, timestamp: new Date() });
}
function getSessionHistory(sessionId) { /* ... (igual) ... */ 
    const session = conversationHistory.find(s => s.id === sessionId);
    return session ? session.messages : [];
}

// --- RUTAS ---
app.get('/', (req, res) => {
    res.render('chat', { knowledgeBaseLoaded: knowledgeBaseChunks.length > 0 });
});

app.post('/chat', async (req, res) => {
    const userInput = req.body.message;
    const sessionId = req.body.sessionId || Date.now().toString();

    if (!userInput) {
        return res.status(400).json({ error: "Mensaje vacío" });
    }
    if (knowledgeBaseChunks.length === 0) {
        return res.status(500).json({ error: "Base de conocimiento no cargada." });
    }

    addMessageToHistory(sessionId, 'user', userInput);

    const relevantChunksTextArray = getRelevantChunks(userInput);
    let contextForLLM = "No se encontró información relevante en la base de conocimiento para esta pregunta.";
    if (relevantChunksTextArray.length > 0) {
        contextForLLM = relevantChunksTextArray.join("\n\n---\n\n");
    }
    
    const systemPromptText = `Eres un bot de soporte técnico. Responde basándote ESTRICTAMENTE en el siguiente contexto proporcionado.
Si la respuesta no está en el contexto, indica que no puedes encontrar la información y sugiere contactar a un operador humano.
No inventes respuestas ni uses conocimiento externo. Sé conciso.

<contexto_relevante>
${contextForLLM}
</contexto_relevante>
`;
    // Estimación de tokens totales de entrada
    const estimatedInputTokens = estimateTokens(systemPromptText) + estimateTokens(userInput);
    console.log(`Estimación de tokens de entrada para API: ~${estimatedInputTokens}`);


    try {
        const messages = [
            { "role": "system", "content": systemPromptText },
            { "role": "user", "content": userInput }
        ];

        const completion = await openaiClient.chat.completions.create({
            model: MODEL_NAME,
            messages: messages,
            temperature: 0.1,
            max_tokens: MAX_OUTPUT_TOKENS, // Limitar la respuesta
        });

        let responseText = completion.choices[0].message.content.trim();
        let escalate = false;
        if (responseText.toLowerCase().includes("operador humano") || 
            responseText.toLowerCase().includes("no se encuentra") || // Más genérico
            responseText.toLowerCase().includes("no puedo encontrar la información")) {
            escalate = true;
        }
        
        addMessageToHistory(sessionId, 'assistant', responseText);
        res.json({ response: responseText, escalate: escalate, sessionId: sessionId });

    } catch (error) {
        console.error("Error al comunicarse con OpenAI:", error);
        let errorMessage = "Error con OpenAI.";
        if (error instanceof OpenAI.APIError) {
            errorMessage = `Error OpenAI API: ${error.message} (Código: ${error.status})`;
            if (error.code === 'context_length_exceeded'){
                errorMessage += `\nEl contexto enviado (prompt + pregunta + chunks: ~${estimatedInputTokens} tokens) fue demasiado largo.`;
            }
        } else if (error.message) {
             errorMessage += ` Mensaje: ${error.message}`;
        }
        res.status(500).json({ error: errorMessage });
    }
});

app.post('/send-email', async (req, res) => { /* ... (igual que antes) ... */ });
app.get('/admin/history', (req, res) => { /* ... (igual que antes) ... */ });

// --- INICIO DEL SERVIDOR ---
async function startServer() {
    const kbLoaded = await loadAndChunkKnowledgeBase();
    if (!kbLoaded) {
        console.warn("ADVERTENCIA: KB (chunks) no se cargó o está vacía.");
    }
    app.listen(port, () => {
        console.log(`Servidor Express escuchando en http://localhost:${port}`);
        if (kbLoaded) {
            console.log(`Chatbot (RAG simplificado) disponible en http://localhost:${port}`);
        } else {
            console.warn(`Chatbot iniciado, PERO KB (chunks) NO PUDO CARGARSE desde ${KNOWLEDGE_BASE_DIR}.`);
        }
    });
}

startServer().catch(err => {
    console.error("Error fatal al iniciar el servidor:", err);
    process.exit(1);
});