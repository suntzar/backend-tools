// index.js - Servidor de conversão de áudio para OGG

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 3000; // O Railway vai injetar a porta correta aqui

// Middleware para habilitar CORS (permite que seu HTML chame a API)
app.use(cors());

// Configura o multer para lidar com o upload de arquivos temporariamente
const upload = multer({ dest: 'uploads/' });

// Cria a pasta de uploads se ela não existir
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// O único endpoint da nossa API: /convert
app.post('/convert', upload.single('audioFile'), (req, res) => {
    // Validação: Garante que um arquivo foi enviado
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo de áudio enviado.' });
    }

    const inputPath = req.file.path;
    const outputFilename = `${path.parse(req.file.filename).name}.ogg`;
    const outputPath = path.join(__dirname, 'uploads', outputFilename);

    console.log(`[INFO] Recebido: ${req.file.originalname}. Convertendo para ${outputFilename}...`);
    console.log(`[DEBUG] Caminho do FFmpeg: ${ffmpegPath}`);

    // Argumentos para o comando FFmpeg
    const args = [
        '-i', inputPath,
        '-c:a', 'libvorbis', // Codec de áudio padrão e de alta qualidade para OGG
        '-q:a', '5',         // Qualidade do áudio (escala -1 a 10, 5 é um bom equilíbrio)
        outputPath
    ];

    // Executa o FFmpeg como um processo separado
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
        // Função de limpeza para apagar os arquivos temporários
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
        
        // Envia o arquivo convertido para o usuário como download
        res.download(outputPath, `${path.parse(req.file.originalname).name}.ogg`, (downloadError) => {
            if (downloadError) {
                console.error(`[ERROR] Falha ao enviar o arquivo: ${downloadError}`);
            }
            // Limpa os arquivos independentemente de o download ter sido bem-sucedido ou não
            cleanup();
        });
    });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor de conversão pronto e ouvindo na porta ${PORT}`);
});