# SSSK shooting results

A program to display shooting results for shooting competitions.

run with
`npm run electron`

or create a .exe file with
`npm run pack:win:portable`


## To run the program via `npm run electron` on ex Linux (Ubuntu/Debian)
### update
`sudo apt update`
### if git not installed
`sudo apt install git`
### clone repository
`git clone https://github.com/fredrikfrost78/sssk-shooting-results.git`
### other needed dependencies
```
cd sssk-shooting-results
sudo apt install -y git nodejs npm libgtk-3-0 libnss3 libxss1 libasound2
npm install
```
### run program
`npm run electron`

## Configuration

The configuration is stored in `server-config.json`. The `resultsDir` property specifies the directory where the
shooting results are stored. If not specified or empty, the default directory is used.

