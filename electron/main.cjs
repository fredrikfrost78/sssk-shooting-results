const { app, BrowserWindow, Menu, dialog } = require('electron')
const path = require('node:path')
const http = require('node:http')
const { fork } = require('node:child_process')

let mainWindow = null
let backendProcess = null
const BACKEND_PORT = 3001

function startBackend() {
    const serverPath = path.join(__dirname, '..', 'server.js')

    backendProcess = fork(serverPath, {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: { ...process.env },
    })

    backendProcess.on('close', code => {
        console.log(`Backend avslutades med kod ${code}`)
    })
}

function updateResultsDir(resultsDir) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ resultsDir })

        const request = http.request(
            {
                hostname: '127.0.0.1',
                port: BACKEND_PORT,
                path: '/config/results-dir',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            response => {
                let body = ''

                response.on('data', chunk => {
                    body += chunk
                })

                response.on('end', () => {
                    if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(body)
                    } else {
                        reject(new Error(`Backend svarade med status ${response.statusCode}: ${body}`))
                    }
                })
            },
        )

        request.on('error', reject)
        request.write(payload)
        request.end()
    })
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        autoHideMenuBar: true,
        backgroundColor: '#111111',
    })

    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    mainWindow.loadFile(indexPath)

    mainWindow.on('closed', () => {
        mainWindow = null
        app.quit()
    })
}

function createMenu() {
    const template = [
        {
            label: 'Arkiv',
            submenu: [
                {
                    label: 'Välj resultatmapp...',
                    click: async () => {
                        if (!mainWindow) return

                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory'],
                            title: 'Välj resultatmapp',
                        })

                        if (result.canceled || result.filePaths.length === 0) {
                            return
                        }

                        const selectedDir = result.filePaths[0]

                        try {
                            await updateResultsDir(selectedDir)
                            mainWindow.webContents.reload()
                        } catch (error) {
                            dialog.showErrorBox(
                                'Kunde inte spara resultatmapp',
                                error instanceof Error ? error.message : String(error),
                            )
                        }
                    },
                },
                { type: 'separator' },
                { role: 'quit', label: 'Avsluta' },
            ],
        },
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
    startBackend()
    createWindow()
    createMenu()
})

app.on('window-all-closed', () => {
    app.quit()
})

app.on('before-quit', () => {
    if (backendProcess) {
        backendProcess.kill()
        backendProcess = null
    }
})