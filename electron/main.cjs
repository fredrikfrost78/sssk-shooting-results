const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { spawn } = require('node:child_process')

let mainWindow = null
let backendProcess = null

function startBackend() {
    const serverPath = path.join(__dirname, '..', 'server.js')

    backendProcess = spawn(process.execPath, [serverPath], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: { ...process.env },
    })

    backendProcess.on('close', code => {
        console.log(`Backend avslutades med kod ${code}`)
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
}

app.whenReady().then(() => {
    startBackend()
    createWindow()
})

app.on('window-all-closed', () => {
    if (backendProcess) {
        backendProcess.kill()
        backendProcess = null
    }

    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    if (backendProcess) {
        backendProcess.kill()
        backendProcess = null
    }
})