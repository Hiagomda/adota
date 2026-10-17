// Assina os builds de release com a chave privada de upload quando o Gradle sabe onde ela está.
//
// O `expo prebuild` recria o android/app/build.gradle, então a assinatura é escrita ali por este
// plugin a cada prebuild, e não à mão. A chave e as senhas nunca entram no repositório: o Gradle
// lê tudo de propriedades guardadas fora dele.
//   - neste PC: C:\Users\hiago\.gradle\gradle.properties
//   - no GitHub Actions: variáveis ORG_GRADLE_PROJECT_EGUA_UPLOAD_* vindas dos secrets
// Sem EGUA_UPLOAD_STORE_FILE o release continua com a chave de debug, a dos celulares instalados.

const MARKER = '// egua-release-signing';

const releaseConfig = `        release { ${MARKER}
            if (findProperty('EGUA_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('EGUA_UPLOAD_STORE_FILE'))
                storePassword findProperty('EGUA_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('EGUA_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('EGUA_UPLOAD_KEY_PASSWORD')
            }
        }
`;

const releaseChoice =
  "signingConfig findProperty('EGUA_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

/** Põe a assinatura de release no build.gradle do app. Rodar duas vezes não muda nada. */
export function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const debugBlock = /(signingConfigs \{\n\s*debug \{[\s\S]*?\n\s{8}\}\n)/;
  if (!debugBlock.test(gradle)) {
    throw new Error('releaseSigning: signingConfigs.debug not found in app/build.gradle');
  }
  let next = gradle.replace(debugBlock, `$1${releaseConfig}`);
  const releaseType =
    /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseType.test(next)) {
    throw new Error(
      'releaseSigning: release buildType signingConfig not found in app/build.gradle',
    );
  }
  next = next.replace(releaseType, `$1${releaseChoice}`);
  return next;
}
