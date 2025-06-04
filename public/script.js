// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const sendEmailButton = document.getElementById('send-email-button');
    const emailStatus = document.getElementById('email-status');
    const typingStatus = document.getElementById('typing-status');

    let currentSessionId = null; // Para mantener el ID de la sesión actual
    let chatEnded = false; // Para controlar si la sesión de chat debe "cortarse"

    function addMessage(text, sender, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        if (isError) {
            messageDiv.classList.add('error-message-display'); // Usar la clase CSS para errores
        } else {
            messageDiv.classList.add(sender === 'user' ? 'user-message' : 'bot-message');
        }
        
        const p = document.createElement('p');
        p.textContent = text;
        messageDiv.appendChild(p);
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll
    }

    async function sendMessage() {
        const messageText = userInput.value.trim();
        if (!messageText || chatEnded) return;

        addMessage(messageText, 'user');
        userInput.value = '';
        userInput.disabled = true;
        sendButton.disabled = true;
        typingStatus.textContent = 'Bot está pensando...';

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageText, sessionId: currentSessionId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error del servidor: ${response.status}`);
            }

            const data = await response.json();
            addMessage(data.response, 'bot');
            currentSessionId = data.sessionId; // Actualizar/establecer sessionId

            if (data.escalate) {
                addMessage("La sesión ha finalizado. Por favor, contacta a un operador para más ayuda.", 'system-message');
                userInput.placeholder = "Sesión finalizada. Contacta a un operador.";
                chatEnded = true; // Marcar que la sesión terminó
                sendButton.disabled = true; // Mantener botón deshabilitado
                // El input ya está deshabilitado, pero se puede volver a hacer explícito
                userInput.disabled = true; 
            } else {
                 userInput.disabled = false; // Reactivar solo si no se escala
                 sendButton.disabled = false;
            }

        } catch (error) {
            console.error('Error al enviar mensaje:', error);
            addMessage(`Error: ${error.message}`, 'bot', true); // Mostrar error en el chat
            userInput.disabled = false;
            sendButton.disabled = false;
        } finally {
            typingStatus.textContent = '';
            if (!chatEnded) { // Solo si no se ha finalizado la sesión
                userInput.focus();
            }
        }
    }

    async function sendChatSummaryByEmail() {
        emailStatus.textContent = 'Enviando correo...';
        emailStatus.className = 'status-message'; // Reset class
        sendEmailButton.disabled = true;

        // Construir un resumen del chat visible para el correo
        let chatSummary = "Resumen de la conversación:\n\n";
        const messages = chatBox.querySelectorAll('.message p');
        messages.forEach(msgElement => {
            const sender = msgElement.parentElement.classList.contains('user-message') ? 'Usuario' : 
                           (msgElement.parentElement.classList.contains('system-message') ? 'Sistema' : 'Bot');
            chatSummary += `${sender}: ${msgElement.textContent}\n`;
        });
        
        try {
            const response = await fetch('/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ summary: chatSummary, sessionId: currentSessionId }),
            });

            const data = await response.json();

            if (data.success) {
                emailStatus.textContent = 'Correo enviado exitosamente.';
                emailStatus.classList.add('success');
            } else {
                emailStatus.textContent = `Error al enviar: ${data.error || 'Desconocido'}`;
                emailStatus.classList.add('error');
            }
        } catch (error) {
            console.error('Error al enviar email:', error);
            emailStatus.textContent = 'Error de conexión al enviar correo.';
            emailStatus.classList.add('error');
        } finally {
            sendEmailButton.disabled = false;
            setTimeout(() => { emailStatus.textContent = ''; emailStatus.className = 'status-message'; }, 5000);
        }
    }

    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    sendEmailButton.addEventListener('click', sendChatSummaryByEmail);

    // Mensaje inicial si la KB no cargó (del EJS)
    const kbWarning = document.querySelector('.system-message p');
    if (kbWarning && kbWarning.textContent.includes("Advertencia: La base de conocimiento no se pudo cargar")) {
         // Ya está en el EJS, solo como recordatorio
    }
});