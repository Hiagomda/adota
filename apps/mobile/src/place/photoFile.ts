import { File, UploadType } from 'expo-file-system';

/** Tamanho da foto já comprimida, em bytes. Zero quando o arquivo não pôde ser lido. */
export async function photoBytes(uri: string): Promise<number> {
  return new File(uri).size ?? 0;
}

/** Envia a foto para o endereço assinado do MinIO e devolve o status HTTP. */
export async function putPhotoFile(uri: string, url: string, signal: AbortSignal): Promise<number> {
  const put = await new File(uri).upload(url, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'content-type': 'image/jpeg' },
    signal,
  });
  return put.status;
}
