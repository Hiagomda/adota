package app.egua.adota.photoshare

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// O Share do React Native no Android só manda texto, e o expo-sharing só manda o arquivo.
// Este módulo manda a foto e a legenda no mesmo Intent, então o WhatsApp mostra a foto com o
// link clicável embaixo.
class PhotoShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PhotoShare")

    // imageUri é um content:// (File.contentUri do expo-file-system), que o outro app consegue ler
    // com a permissão dada pelo FLAG_GRANT_READ_URI_PERMISSION.
    AsyncFunction("share") { imageUri: String, mimeType: String, text: String, title: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val uri = Uri.parse(imageUri)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, text)
        // Sem o ClipData, alguns apps não recebem a permissão de leitura pelo seletor.
        clipData = ClipData.newRawUri(null, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(send, title).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(chooser)
    }
  }
}
