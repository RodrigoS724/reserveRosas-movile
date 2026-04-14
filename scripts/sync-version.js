const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const packagePath = path.join(root, 'package.json')
const appPath = path.join(root, 'app.json')

function run(command) {
  try {
    return execSync(command, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'))

const commitCount = Number(run('git rev-list --count HEAD')) || Number(app?.expo?.android?.versionCode || 1)
const shortSha = run('git rev-parse --short HEAD') || 'local'

app.expo = app.expo || {}
app.expo.version = String(pkg.version || '1.0.0')
app.expo.ios = {
  ...(app.expo.ios || {}),
  buildNumber: String(commitCount),
}
app.expo.android = {
  ...(app.expo.android || {}),
  versionCode: Math.max(1, commitCount),
}
app.expo.extra = {
  ...(app.expo.extra || {}),
  gitCommit: shortSha,
  gitVersionCode: commitCount,
}

fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')

console.log(`Version sincronizada: ${app.expo.version} (${commitCount}) [${shortSha}]`)
