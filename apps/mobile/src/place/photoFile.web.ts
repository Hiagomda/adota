// No navegador a foto é um blob: ou data: e o expo-file-system não lê nenhum dos dois.

async function photoBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

export async function photoBytes(uri: string): Promise<number> {
  return (await photoBlob(uri)).size;
}

export async function putPhotoFile(uri: string, url: string, signal: AbortSignal): Promise<number> {
  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: await photoBlob(uri),
    signal,
  });
  return put.status;
}
