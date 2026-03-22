import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import bundledServerConfig from './server-config.json' with { type: 'json' }

const app = express()
app.use(cors())

const CONFIG_DIR = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'SSSK Shooting Results',
)

const CONFIG_PATH = path.join(CONFIG_DIR, 'server-config.json')

function ensureConfigFile() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        fs.writeFileSync(
            CONFIG_PATH,
            JSON.stringify(bundledServerConfig, null, 2),
            'utf-8',
        )
    }
}

function readServerConfig() {
    ensureConfigFile()
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
}

function writeServerConfig(nextConfig) {
    ensureConfigFile()
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2), 'utf-8')
}

const initialConfig = readServerConfig()
const PORT = initialConfig.port ?? 3001

app.get('/config', (req, res) => {
    res.json(readServerConfig())
})

app.post('/config/results-dir', express.json(), (req, res) => {
    const { resultsDir } = req.body ?? {}

    if (typeof resultsDir !== 'string' || resultsDir.trim() === '') {
        res.status(400).json({ message: 'Ogiltig resultatmapp' })
        return
    }

    const currentConfig = readServerConfig()
    const nextConfig = {
        ...currentConfig,
        resultsDir: resultsDir.trim(),
    }

    writeServerConfig(nextConfig)
    res.json(nextConfig)
})

app.get('/results', (req, res) => {
    const serverConfig = readServerConfig()
    const RESULTS_DIR = serverConfig.resultsDir

    if (!RESULTS_DIR || !fs.existsSync(RESULTS_DIR)) {
        res.status(400).send('Ingen giltig resultatmapp är konfigurerad')
        return
    }

    let files = []
    try {
        files = fs.readdirSync(RESULTS_DIR)
    } catch (e) {
        console.error('Kunde inte läsa katalog:', e)
        res.status(500).send('Kunde inte läsa resultatmapp')
        return
    }

    const latestExcelFile = files
        .filter(fileName => fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))
        .map(fileName => ({
            fileName,
            fullPath: path.join(RESULTS_DIR, fileName),
            modifiedTime: fs.statSync(path.join(RESULTS_DIR, fileName)).mtimeMs,
        }))
        .sort((a, b) => b.modifiedTime - a.modifiedTime)[0]

    if (!latestExcelFile) {
        res.status(404).send('Ingen resultatfil hittades')
        return
    }

    res.sendFile(latestExcelFile.fullPath, err => {
        if (err) {
            console.error('Kunde inte läsa fil:', err)
            res.status(404).send('Filen hittades inte')
        }
    })
})

app.listen(PORT, () => {
    const currentConfig = readServerConfig()
    console.log(`Backend kör på http://localhost:${PORT}`)
    console.log(`Config används: ${CONFIG_PATH}`)
    console.log(`Läser senaste Excel-fil från: ${currentConfig.resultsDir}`)
})