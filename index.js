// index.js - Versão 4.0, com controle fino de bitrate e sample rate

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

    // --- CONTROLE DE BITRATE (QUALIDADE) ---
    // Valores de '-q:a' para Vorbis. Vamos usar uma escala de -1 a 10.
    // Padrão para 2 se não for especificado.
    const quality = parseInt(req.body.quality, 10);
    const qscaleValue = (quality >= -1 && quality <= 10) ? quality : 2;

    // --- CONTROLE DE TAXA DE AMOSTRAGEM (SAMPLE RATE) ---
    // Padrão para 'auto' (não modificar) se não for especificado.
    const sampleRate = req.body.sampleRate;
    const validSampleRates = ['44100', '32000', '22050', '16000'];

    const inputPath = req.file.path;
    const outputFilename = `${path.parse(req.file.filename).name}.ogg`;
    const outputPath = path.join(__dirname, 'uploads', outputFilename);

    console.log(`[INFO] Recebido: ${req.file.originalname}. Bitrate (q:a): ${qscaleValue}. Sample Rate: ${sampleRate || 'auto'}`);

    // --- Montagem dinâmica dos argumentos do FFmpeg ---
    const args = [
        '-i', inputPath,
        '-c:a', 'libvorbis',
        '-q:a', qscaleValue.toString() // Argumento de qualidade (bitrate)
    ];

    // Adiciona o argumento de sample rate APENAS se for um valor válido
    if (validSampleRates.includes(sampleRate)) {
        args.push('-ar', sampleRate); // '-ar' define a taxa de amostragem de áudio
    }

    args.push(outputPath); // Arquivo de saída

    execFile(ffmpegPath, args, (error, stdout, stderr) => {
        const cleanup = () => {
            fs.unlink(inputPath, err => err && console.error(`[CLEANUP] Falha ao remover input: ${err}`));
            fs.unlink(outputPath, err => err && console.error(`[CLEANUP] Falha ao remover output: ${err}`));
        };

        if (error) {
            console.error(`[ERROR] FFmpeg falhou: ${stderr}`);
            cleanup();
            return res.status(500).json({ error: 'Falha na conversão do áudio.', details: stderr });
        }

        console.log(`[SUCCESS] Conversão finalizada com sucesso.`);
        
        const finalFilename = `${path.parse(req.file.originalname).name}_q${qscaleValue}_${sampleRate || 'original'}Hz.ogg`;
        res.download(outputPath, finalFilename, (downloadError) => {
            if (downloadError) {
                console.error(`[ERROR] Falha ao enviar o arquivo: ${downloadError}`);
            }
            cleanup();
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor de conversão v4 (controle fino) pronto na porta ${PORT}`);
});