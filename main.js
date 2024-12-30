const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth()
});

const estadosChats = new Map(); // Controla el estado de cada chat
const temporizadores = new Map(); // Almacena temporizadores para cada chat
const archivoDatos = './datos.txt'; // Archivo con números y nombres
const intervaloVerificacion = 30000; // Intervalo de verificación en milisegundos
const encuestados = new Set(); // Lista de IDs de chat enviados

// Preguntas de la encuesta
const preguntas = [
    {
        id: 1,
        texto: "Basándose en esta experiencia, ¿qué probabilidad hay de que recomiendes al Hospital IMG a un amigo o familiar, donde 0 equivale a Nada probable y 10 a Muy probable? \nResponde de un rango de (0-10)",
        rango: [0, 10]
    },
    {
        id: 2,
        texto: `¿Qué tan satisfecho te encuentras con los siguientes aspectos?\n
Responde de 1 a 5 según tu experiencia:\n 
1️⃣ Muy Insatisfecho 😠
2️⃣ Insatisfecho 😟
3️⃣ Neutral 😐
4️⃣ Satisfecho 🙂
5️⃣ Muy Satisfecho 😄
\n *A.) TIEMPO DE ATENCION* ⏱️ \nResponde de un rango de (1-5)`,
        rango: [1, 5]
    },
    {
        id: 3,
        texto: `*B.) CALIDAD DE LA COMIDA* 🥗 \nResponde de un rango de (1-5)`,
        rango: [1, 5]
    },
    {
        id: 4,
        texto: `*C.1.) SERVICION AL CLIENTE* 🛎️ \nResponde de un rango de (1-5)`,
        rango: [1, 5],
        subpregunta: [
            { id: 4, texto: `*C.2.) ¿Por qué no te encuentras tan satisfecho con el servicio al cliente? * ⏱️:\n
1️⃣ Velocidad en el servicio
2️⃣ Amabilidad de los empleados 
\nResponde de un rango de (1-2)`, rango: [1, 2] }
        ]
    },
    {
        id: 5,
        texto: `*D.) FACTURACION* 💳📄 \nResponde de un rango de (1-5)`,
        rango: [1, 5]
    },
    {
        id: 6,
        texto: `*E.1.) AMABILIDAD DE EMPLEADOS* 🛎️ \nResponde de un rango de (1-5)`,
        rango: [1, 5],
        subpregunta: [
            { id: 6, texto: `*E.2.) ¿Por qué no te encuentras tan satisfecho con la amabilidad de los empleados? * ⏱️\n
1️⃣ Empleados estaba distraído
2️⃣ Empleados tenía pocas habilidades de comunicación
3️⃣ Empleados no sonreía y no me miraba a los ojos
4️⃣ Empleado fue grosero y descortés
\nResponde de un rango de (1-4):`, rango: [1, 4] }
        ]
    },
    {
        id: 7,
        texto: `*F.1.) AMABILIDAD DE LOS DOCTORES* 🛎️ \nResponde de un rango de (1-5)`,
        rango: [1, 5],
        subpregunta: [
            { id: 7, texto: `*F.2.) ¿Por qué no te encuentras tan satisfecho con la amabilidad de los doctores? * ⏱️\n
1️⃣ Doctor no me escuchaba mi real necesidad
2️⃣ Doctor tenía pocas habilidades de comunicación
3️⃣ Doctor no sonreía y no me miraba a los ojos
4️⃣ Doctor fue grosero y descortés
5️⃣ Doctor no me resolvió el motivo de consulta
\nResponde de un rango de (1-5):
`, rango: [1, 5] }
        ]
    }
];

// Leer usuarios del archivo
function leerDatosArchivo() {
    if (!fs.existsSync(archivoDatos)) {
        console.error(`Archivo ${archivoDatos} no encontrado.`);
        return [];
    }

    const datos = fs.readFileSync(archivoDatos, 'utf-8').trim();
    if (!datos) return [];

    return datos.split('\n').map((linea) => {
        const [chatId, nombre] = linea.split(',');
        return { chatId: chatId.trim(), nombre: nombre.trim() };
    });
}

// Actualizar el archivo excluyendo los enviados
function actualizarArchivo(datosActualizados) {
    const contenido = datosActualizados.map(({ chatId, nombre }) => `${chatId},${nombre}`).join('\n');
    fs.writeFileSync(archivoDatos, contenido, 'utf-8');
}

// Verificar nuevos chats cada 30 segundos
function verificarNuevosChats() {
    setInterval(async () => {
        console.log("Verificando nuevos chats...");
        const usuarios = leerDatosArchivo();

        for (const { chatId, nombre } of usuarios) {
            if (!estadosChats.has(chatId)) {
                // Iniciar el estado del chat
                estadosChats.set(chatId, { preguntaActual: 0, respuestas: {}, nombre });

                // Enviar la primera pregunta
                const mensajeInicial = `*¡${saludoSegunHora()}, ${nombre}! 🌞*\n
Soy *Valeria* del *Hospital IMG* 🏥.\n${preguntas[0].texto}`;
                await client.sendMessage(chatId, mensajeInicial);
                encuestados.add(chatId); // Marcar como enviado
                // Configurar temporizadores para este chat
                configurarTemporizadores(chatId);
                console.log(`Encuesta iniciada para ${nombre} (${chatId})`);
                // Filtrar datos restantes y actualizar el archivo
                const datosRestantes = usuarios.filter(({ chatId }) => !encuestados.has(chatId));
                actualizarArchivo(datosRestantes);
            }
        }
    }, intervaloVerificacion);
}

// Configurar temporizadores para un chat
function configurarTemporizadores(chatId) {
    // Temporizador para enviar recordatorio
    const recordatorio = setTimeout(async () => {
        await client.sendMessage(chatId, "¿Aún estás ahí? Por favor, responde para continuar con la encuesta.");
        console.log(`Recordatorio enviado a ${chatId}`);
    }, 60000); // 1 minuto

    // Temporizador para finalizar el chat
    const finalizar = setTimeout(async () => {
        if (estadosChats.has(chatId)) {
            await client.sendMessage(chatId, "Hemos finalizado el chat por falta de respuesta. ¡Hasta luego!");
            estadosChats.delete(chatId); // Eliminar el estado
            encuestados.delete(chatId); // Marcar como completado
            console.log(`Chat finalizado automáticamente para ${chatId}`);
        }
    }, 120000); // 2 minutos

    // Almacenar los temporizadores
    temporizadores.set(chatId, { recordatorio, finalizar });
}

// Cancelar temporizadores de un chat
function cancelarTemporizadores(chatId) {
    const timers = temporizadores.get(chatId);
    if (timers) {
        clearTimeout(timers.recordatorio);
        clearTimeout(timers.finalizar);
        temporizadores.delete(chatId);
        console.log(`Temporizadores cancelados para ${chatId}`);
    }
}

async function esperarRespuesta(chatId) {
    return new Promise((resolve) => {
        const handler = (message) => {
            // Verificar si el mensaje es del chat esperado
            if (message.from === chatId) {
                client.removeListener('message', handler); // Eliminar el listener después de capturar la respuesta
                resolve(message.body.trim()); // Devolver el cuerpo del mensaje
            }
        };

        // Agregar listener para capturar la respuesta
        client.on('message', handler);
    });
}

client.on('message', async (message) => {
    const chatId = message.from;

    // Verificar si el chat tiene un estado
    let estado = estadosChats.get(chatId);

    if (!estado) {
        console.log(`Mensaje ignorado de ${chatId}. No está en la lista de encuestas activas.`);
        return;
    }

    // Cancelar temporizadores si el usuario responde
    cancelarTemporizadores(chatId);

    // Validar la respuesta para la pregunta actual
    const preguntaActual = preguntas[estado.preguntaActual];
    const respuesta = parseInt(message.body.trim(), 10);

    if (isNaN(respuesta) || respuesta < preguntaActual.rango[0] || respuesta > preguntaActual.rango[1]) {
        await client.sendMessage(chatId, `Por favor, responde con un número entre ${preguntaActual.rango[0]} y ${preguntaActual.rango[1]}.`);
        configurarTemporizadores(chatId); // Reconfigurar temporizadores si la respuesta no es válida
        return;
    }

    // Guardar la respuesta principal
    estado.respuestas[preguntaActual.id] = respuesta.toString(); // Guardar como string

    // Manejo de subpreguntas
    if (preguntaActual.subpregunta) {
        if (respuesta <= 2 && !estado.subpreguntaEnviada) {
            const subpregunta = preguntaActual.subpregunta[0]; // Solo una subpregunta por ahora

            // Marcar la subpregunta como enviada
            estado.subpreguntaEnviada = true;

            // Enviar la subpregunta
            await client.sendMessage(chatId, subpregunta.texto);

            // Esperar la respuesta de la subpregunta
            const subRespuesta = parseInt(await esperarRespuesta(chatId), 10);

            if (isNaN(subRespuesta) || subRespuesta < subpregunta.rango[0] || subRespuesta > subpregunta.rango[1]) {
                await client.sendMessage(chatId, `Por favor, responde con un número entre ${subpregunta.rango[0]} y ${subpregunta.rango[1]}.`);
                return;
            }

            // Guardar la respuesta combinada
            estado.respuestas[preguntaActual.id] = `${respuesta}-${subRespuesta}`;
            console.log(`Respuesta combinada guardada para ${preguntaActual.id}: ${estado.respuestas[preguntaActual.id]}`);

            // No incrementar la pregunta actual al manejar una subpregunta
            return;
        } else {
            console.log(`Subpregunta no activada para ${preguntaActual.id}, avanzando...`);
        }
    }

    // Pasar a la siguiente pregunta
    estado.preguntaActual++;
    estado.subpreguntaEnviada = false; // Resetear para futuras preguntas

    if (estado.preguntaActual < preguntas.length) {
        // Enviar la siguiente pregunta
        const siguientePregunta = preguntas[estado.preguntaActual];
        await client.sendMessage(chatId, siguientePregunta.texto);
        configurarTemporizadores(chatId); // Configurar temporizadores para la siguiente pregunta
    } else {
        // Finalizar la encuesta
        if(parseInt(estado.respuestas[1], 10) >= 5 ){
            const link = "https://g.page/r/CX_xcHqkkRTQEAE/review";
            const rutaImagen = './qr_IMG.jpeg';

            await client.sendMessage(chatId, `¡Gracias por tu respuesta! Completa nuestra encuesta escaneando el código QR o usando este enlace: ${link}.`);
            const media = MessageMedia.fromFilePath(rutaImagen);
            await client.sendMessage(chatId, media);
        }
        await client.sendMessage(chatId, "Gracias por completar la encuesta. ¡Hasta luego!");
        console.log(`Respuestas del chat ${chatId}:`, estado.respuestas);

        // Eliminar el estado del chat
        estadosChats.delete(chatId);
        encuestados.delete(chatId);
        cancelarTemporizadores(chatId);
    }
});


// Función para obtener un saludo según la hora
function saludoSegunHora() {
    const hora = new Date().getHours();
    if (hora >= 6 && hora < 12) {
        return "Buenos días";
    } else if (hora >= 12 && hora < 18) {
        return "Buenas tardes";
    } else {
        return "Buenas noches";
    }
}

// Evento de conexión del cliente
client.on('ready', async () => {
    console.log("Cliente conectado y listo.");

    // Iniciar la verificación de nuevos chats
    verificarNuevosChats();
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("Escanea el código QR para autenticarte.");
});

client.on('authenticated', () => {
    console.log("Autenticación exitosa.");
});

client.on('auth_failure', (err) => {
    console.error("Error en la autenticación:", err);
});

client.on('disconnected', (reason) => {
    console.log(`Cliente desconectado: ${reason}`);
});

// Iniciar cliente
client.initialize();
