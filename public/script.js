// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const sendEmailButton = document.getElementById('send-email-button');
    const emailStatusSpan = document.getElementById('email-status');
    const typingStatusDiv = document.getElementById('typing-status'); // Referencia al nuevo div

    // Crear o obtener el elemento para ARIA live announcements
    let liveRegion = document.getElementById('live-announcer');
    if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('id', 'live-announcer');
        liveRegion.classList.add('visually-hidden'); // Ocultarlo visualmente
        document.body.appendChild(liveRegion);
    }

    // Función para añadir mensajes al chat
    function addMessage(sender, text) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(sender === 'user' ? 'user-message' : 'bot-message');

        const p = document.createElement('p');
        // Usamos innerHTML solo para permitir formato básico si el modelo lo genera (negritas, listas)
        // PERO esto abre una pequeña brecha de seguridad si el modelo pudiera generar HTML malicioso.
        // Para mayor seguridad, vuelve a textContent.
        // textContent = text; // Opción más segura
        p.innerHTML = text; // Permite HTML básico

        messageElement.appendChild(p);
        chatBox.appendChild(messageElement);

        // Anunciar el mensaje del bot para lectores de pantalla
        if (sender === 'bot') {
             announceLiveRegion(`Bot dice: ${text}`);
        }


        // Desplazar al final
        chatBox.scrollTop = chatBox.scrollHeight;

        return messageElement; // Devolver el elemento creado
    }

    // Función para anunciar texto en la región ARIA live
    function announceLiveRegion(text) {
        // Limpiar antes para asegurar que el lector de pantalla lo lea como nuevo
        liveRegion.textContent = '';
        // Pequeño retraso para algunos lectores de pantalla
        setTimeout(() => {
            liveRegion.textContent = text;
        }, 100);
    }


    // Función para mostrar el indicador de "escribiendo"
    function showTypingIndicator() {
        typingStatusDiv.textContent = 'Escribiendo...';
        // Opcional: Announce for screen readers (less common for subtle indicators)
        // announceLiveRegion('Bot está escribiendo...');
    }

    // Función para ocultar el indicador de "escribiendo"
    function hideTypingIndicator() {
        typingStatusDiv.textContent = '';
        // Opcional: Announce for screen readers (less common)
        // announceLiveRegion('');
    }


    // Función para enviar el mensaje al backend
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) {
            userInput.focus();
            return; // No enviar mensajes vacíos
        }

        addMessage('user', message);
        userInput.value = ''; // Limpiar input

        // Deshabilitar input y botón mientras se espera respuesta
        userInput.disabled = true;
        sendButton.disabled = true;
        sendButton.textContent = 'Enviando...';

        // --- Mostrar el indicador de "escribiendo" ---
        showTypingIndicator();


        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();

            // --- Ocultar el indicador antes de añadir la respuesta ---
            hideTypingIndicator();

            if (response.ok) {
                addMessage('bot', data.response);
            } else {
                // Añadir un mensaje de error claro
                addMessage('bot', `Error: ${data.error || 'No se recibió respuesta del servidor.'}`);
                 // Anunciar el error para lectores de pantalla
                 announceLiveRegion(`Error del bot: ${data.error || 'No se recibió respuesta del servidor.'}`);
            }

        } catch (error) {
            console.error('Error al enviar mensaje al backend:', error);
            // --- Ocultar el indicador incluso en caso de error ---
            hideTypingIndicator();
            addMessage('bot', 'Lo siento, ocurrió un error de comunicación con el servidor.');
             // Anunciar el error de comunicación
             announceLiveRegion('Lo siento, ocurrió un error de comunicación con el servidor.');
        } finally {
            // Habilitar input y botón de nuevo
            userInput.disabled = false;
            sendButton.disabled = false;
            sendButton.textContent = 'Enviar';
            userInput.focus(); // Devolver el foco al input
        }
    }

    // Evento para el botón de enviar
    sendButton.addEventListener('click', sendMessage);

    // Evento para la tecla Enter en el input
    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Evita el salto de línea por defecto
            sendMessage();
        }
    });

    // --- Funcionalidad de enviar email ---

    // Función para recopilar el historial del chat
    function getChatHistory() {
        let history = '';
        chatBox.querySelectorAll('.message').forEach(msgElement => {
            // Ignorar mensajes del sistema de carga de KB
            if (!msgElement.classList.contains('system-message')) {
                const sender = msgElement.classList.contains('user-message') ? 'Usuario' : 'Bot';
                // Usar textContent para el resumen del email para evitar HTML
                const text = msgElement.textContent;
                history += `${sender}: ${text}\n`;
             }
        });
        return history;
    }

    // Evento para el botón de enviar email
    sendEmailButton.addEventListener('click', async () => {
        const chatHistory = getChatHistory();

        if (!chatHistory.trim()) {
            emailStatusSpan.textContent = 'No hay chat para enviar.';
            emailStatusSpan.style.color = 'orange';
             announceLiveRegion('No hay chat para enviar por correo.');
             setTimeout(() => emailStatusSpan.textContent = '', 3000); // Limpiar después de 3s
            return;
        }

        sendEmailButton.disabled = true;
        sendEmailButton.textContent = 'Enviando...';
        emailStatusSpan.textContent = 'Enviando correo...';
        emailStatusSpan.style.color = '#6c757d';
        announceLiveRegion('Enviando correo...');


        try {
            const response = await fetch('/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ summary: chatHistory })
            });

            const data = await response.json();

            if (response.ok) {
                emailStatusSpan.textContent = data.message;
                emailStatusSpan.style.color = 'green';
                 announceLiveRegion(data.message);
            } else {
                emailStatusSpan.textContent = `Error: ${data.error || 'No se pudo enviar el correo.'}`;
                emailStatusSpan.style.color = 'red';
                 announceLiveRegion(`Error al enviar correo: ${data.error || 'Desconocido'}`);
            }

        } catch (error) {
            console.error('Error al enviar email:', error);
            emailStatusSpan.textContent = 'Error de comunicación al enviar correo.';
            emailStatusSpan.style.color = 'red';
             announceLiveRegion('Error de comunicación al enviar correo.');
        } finally {
            sendEmailButton.disabled = false;
            sendEmailButton.textContent = 'Enviar Resumen por Correo';
             // Limpiar mensaje de estado después de unos segundos
             setTimeout(() => {
                 emailStatusSpan.textContent = '';
             }, 5000); // 5 segundos
        }
    });
});