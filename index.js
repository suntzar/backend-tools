// index.js - Versão 3.0, com controle de qualidade

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

    // --- NOVA FUNCIONALIDADE: Controle de Qualidade ---
    // Pegamos o valor 'quality' do corpo da requisição. Se não for enviado, usamos '5' (Equilibrado) como padrão.
    const qualityProfile = req.body.quality || '5';
    
    // Validamos para garantir que é um dos valores esperados, por segurança.
    const validProfiles = {
        'alta': '8',
        'equilibrada': '5',
        'otimizada': '2'
    };
    const qscaleValue = validProfiles[qualityProfile] || validProfiles['equilibrada']; // Padrão para 'equilibrada' se um valor inválido for enviado

    const inputPath = req.file.path;
    const outputFilename = `${path.parse(req.file.filename).name}.ogg`;
    const outputPath = path.join(__dirname, 'uploads', outputFilename);

    console.log(`[INFO] Recebido: ${req.file.originalname}. Perfil de qualidade: ${qualityProfile} (q:a ${qscaleValue})`);
    
    // --- Argumentos do FFmpeg atualizados ---
    const args = [
        '-i', inputPath,
        '-c:a', 'libvorbis',
        '-q:a', qscaleValue, // Usamos o valor de qualidade recebido
        outputPath
    ];

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
        
        const finalFilename = `${path.parse(req.file.originalname).name}_${qualityProfile}.ogg`;
        res.download(outputPath, finalFilename, (downloadError) => {
            if (downloadError) {
                console.error(`[ERROR] Falha ao enviar o arquivo: ${downloadError}`);
            }
            cleanup();
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor de conversão v3 (com qualidade) pronto na porta ${PORT}`);
});