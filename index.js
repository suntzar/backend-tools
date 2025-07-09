// index.js - Versão 5.0, Modo Engenheiro com controle total

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.post('/convert', upload.single('audioFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo de áudio enviado.' });
    }

    const {
        bitrateMode, // 'quality' ou 'bitrate'
        quality,     // -1 a 10
        bitrate,     // ex: '64k'
        sampleRate,  // ex: 22050
        channels     // '1' ou '2'
    } = req.body;

    const inputPath = req.file.path;
    const outputFilename = `${path.parse(req.file.filename).name}.ogg`;
    const outputPath = path.join(__dirname, 'uploads', outputFilename);

    // --- Montagem do comando FFmpeg com controle granular ---
    const args = ['-i', inputPath, '-c:a', 'libvorbis'];
    let finalFilenameParts = [path.parse(req.file.originalname).name];

    // 1. Modo de Bitrate
    if (bitrateMode === 'bitrate' && bitrate && /^\d+k$/.test(bitrate)) {
        args.push('-b:a', bitrate);
        finalFilenameParts.push(`${bitrate}`);
    } else { // Padrão é 'quality'
        const q_val = parseInt(quality, 10);
        const safe_q = (q_val >= -1 && q_val <= 10) ? q_val : 4; // Padrão seguro
        args.push('-q:a', safe_q.toString());
        finalFilenameParts.push(`q${safe_q}`);
    }
    
    // 2. Taxa de Amostragem
    const sr_val = parseInt(sampleRate, 10);
    if (sr_val > 8000 && sr_val <= 48000) {
        args.push('-ar', sr_val.toString());
        finalFilenameParts.push(`${sr_val}hz`);
    }

    // 3. Canais de Áudio
    if (channels === '1' || channels === '2') {
        args.push('-ac', channels);
        finalFilenameParts.push(channels === '1' ? 'mono' : 'stereo');
    }
    
    args.push(outputPath);

    console.log(`[EXEC] Executando comando: ffmpeg ${args.join(' ')}`);

    execFile(ffmpegPath, args, (error, stdout, stderr) => {
        const cleanup = () => {
            fs.unlink(inputPath, err => err && console.error(`[CLEANUP] Falha ao remover input: ${err}`));
            fs.unlink(outputPath, err => err && console.error(`[CLEANUP] Falha ao remover output: ${err}`));
        };

        if (error) {
            console.error(`[ERROR] FFmpeg falhou: ${stderr}`);
            cleanup();
            return res.status(500).json({ error: 'Falha na conversão.', details: stderr });
        }
        
        const finalFilename = `${finalFilenameParts.join('_')}.ogg`;
        res.download(outputPath, finalFilename, (downloadError) => {
            if (downloadError) console.error(`[ERROR] Falha ao enviar arquivo: ${downloadError}`);
            cleanup();
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor de conversão v5 (Modo Engenheiro) pronto na porta ${PORT}`);
});