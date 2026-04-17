# ReserveRosas Mobile

## Flujo de actualizacion OTA con GitHub

Este repositorio publica actualizaciones OTA de Expo/EAS automaticamente usando GitHub Actions.

Workflow: `.github/workflows/manual.yml`

### Que hace

- En cada push a `master` publica update OTA en canal `production`.
- Permite ejecucion manual desde Actions para `preview` o `production`.

### Requisito obligatorio

Configurar este secret en GitHub (repo `reserveRosas-movile`):

- `EAS_TOKEN`: token de Expo/EAS con permisos para publicar updates.

Ademas el proyecto debe estar enlazado en EAS (si no lo esta, ejecutar una vez `npx eas-cli init` localmente).

## Paso a paso para dejarlo pronto en GitHub

1. Entrar al repo `reserveRosas-movile` en GitHub.
2. Ir a `Settings > Secrets and variables > Actions`.
3. Crear el secret `EAS_TOKEN`.
4. Verificar que exista el workflow `.github/workflows/manual.yml` en la rama `master`.
5. Ir a la pestaña `Actions` y ejecutar una vez `Mobile OTA Update` en modo manual:
	- Channel: `preview`
	- Message: opcional
6. Abrir una build real instalada en celular (no Expo Go dev server) y verificar que detecte update.
7. Si funciona, usar push a `master` para publicar en `production` automaticamente.

## Publicacion diaria (sin tocar nada)

- Flujo normal: push a `master`.
- Resultado: GitHub Actions publica OTA en canal `production` automaticamente.
- Solo para hotfix manual: `Actions > Mobile OTA Update > Run workflow`.

### Como probar

1. Ir a GitHub Actions y ejecutar `Mobile OTA Update` en modo manual.
2. Elegir canal `preview`.
3. Abrir la app instalada (build real, no Expo Go en modo dev).
4. La app debe detectar update en carga y pedir reinicio.

### Nota importante

- Si cambias codigo nativo, OTA no alcanza; hay que generar nueva build.
- Si cambias solo JS/TS/assets, OTA aplica sin subir nueva build.
