// index.js - Versão 6.0, com WebSockets para logs e progresso em tempo real

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); // Usaremos spawn para melhor controle de streams
const ffmpegPath = require('ffmpeg-static');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const clients = new Map(); // Armazena conexões WebSocket por clientId
const conversionJobs = new Map(); // Armazena informações dos jobs

// --- Lógica do WebSocket ---
wss.on('connection', (ws) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    clients.set(clientId, ws);
    console.log(`[WS] Cliente conectado: ${clientId}`);

    // Envia o ID gerado para o cliente para que ele possa usá-lo no upload
    ws.send(JSON.stringify({ type: 'welcome', clientId }));

    ws.on('close', () => {
        console.log(`[WS] Cliente desconectado: ${clientId}`);
        clients.delete(clientId);
        // Opcional: cancelar job de conversão se o cliente desconectar
        if (conversionJobs.has(clientId)) {
            const job = conversionJobs.get(clientId);
            if (job.process) job.process.kill();
            conversionJobs.delete(clientId);
        }
    });
});

function sendMessage(clientId, type, data) {
    if (clients.has(clientId)) {
        clients.get(clientId).send(JSON.stringify({ type, data }));
    }
}

// --- Lógica do Servidor HTTP ---
app.use(require('cors')());
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Endpoint de Upload
app.post('/convert', upload.single('audioFile'), (req, res) => {
    const { clientId, ...options } = req.body;

    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    if (!clientId || !clients.has(clientId)) return res.status(400).json({ error: 'Conexão WebSocket inválida ou não encontrada.' });
    
    // Confirma o recebimento do arquivo e que o processamento vai começar
    res.status(202).json({ message: 'Arquivo recebido. O progresso será enviado via WebSocket.' });
    
    startConversion(req.file, options, clientId);
});

// Endpoint de Download
app.get('/download/:fileId', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.fileId);
    if (fs.existsSync(filePath)) {
        const originalName = req.query.name || 'resultado.ogg';
        res.download(filePath, originalName, (err) => {
            if (err) console.error(`[DOWNLOAD] Erro ao enviar ${filePath}:`, err);
            // Limpa o arquivo após o download ser iniciado
            fs.unlink(filePath, (unlinkErr) => {
                if(unlinkErr) console.error(`[CLEANUP] Erro ao deletar ${filePath}:`, unlinkErr);
            });
        });
    } else {
        res.status(404).send('Arquivo não encontrado ou já baixado.');
    }
});

// --- Lógica da Conversão ---
function startConversion(file, options, clientId) {
    const inputPath = file.path;
    const outputFilename = `${path.parse(file.filename).name}.ogg`;
    const outputPath = path.join(__dirname, 'uploads', outputFilename);

    const args = buildFfmpegArgs(inputPath, outputPath, options);
    console.log(`[FFMPEG] Comando para ${clientId}: ffmpeg ${args.join(' ')}`);

    const ffmpegProcess = spawn(ffmpegPath, args);
    conversionJobs.set(clientId, { process: ffmpegProcess });

    let totalDuration = 0;

    ffmpegProcess.stderr.on('data', (data) => {
        const line = data.toString();
        sendMessage(clientId, 'log', line); // Envia cada linha de log

        // Tenta extrair a duração total do áudio (aparece no início do log)
        if (totalDuration === 0) {
            const durationMatch = line.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
            if (durationMatch) {
                const [, hours, minutes, seconds, milliseconds] = durationMatch;
                totalDuration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseFloat(`0.${milliseconds}`);
                sendMessage(clientId, 'duration', totalDuration);
            }
        }
        
        // Extrai o progresso atual
        const progressMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (progressMatch && totalDuration > 0) {
            const [, hours, minutes, seconds, milliseconds] = progressMatch;
            const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseFloat(`0.${milliseconds}`);
            const percentage = Math.min(100, Math.round((currentTime / totalDuration) * 100));
            sendMessage(clientId, 'progress', percentage);
        }
    });

    ffmpegProcess.on('close', (code) => {
        fs.unlinkSync(inputPath); // Deleta o arquivo de upload original
        conversionJobs.delete(clientId);

        if (code === 0) {
            console.log(`[FFMPEG] Conversão para ${clientId} finalizada com sucesso.`);
            const downloadUrl = `/download/${outputFilename}?name=${encodeURIComponent(file.originalname.replace(/\.[^/.]+$/, "") + ".ogg")}`;
            sendMessage(clientId, 'done', { downloadUrl });
        } else {
            console.error(`[FFMPEG] Conversão para ${clientId} falhou com código ${code}`);
            sendMessage(clientId, 'error', `FFmpeg falhou com código de saída ${code}. Verifique os logs para detalhes.`);
        }
    });
}

function buildFfmpegArgs(input, output, options) {
    const { bitrateMode, quality, bitrate, sampleRate, channels } = options;
    const args = ['-i', input];

    if (bitrateMode === 'bitrate' && bitrate && /^\d+k$/.test(bitrate)) {
        args.push('-b:a', bitrate);
    } else {
        const q_val = parseInt(quality, 10);
        const safe_q = (q_val >= -1 && q_val <= 10) ? q_val : 4;
        args.push('-q:a', safe_q.toString());
    }

    if (sampleRate && !isNaN(sampleRate) && sampleRate > 0) {
        args.push('-ar', sampleRate);
    }
    if (channels === '1' || channels === '2') {
        args.push('-ac', channels);
    }
    
    args.push('-y', output); // -y para sobrescrever o arquivo de saída se existir
    return args;
}

server.listen(PORT, () => {
    console.log(`Servidor v6 (com WebSocket) rodando na porta ${PORT}`);
});