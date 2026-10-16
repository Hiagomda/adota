# Fotos ficam no MinIO da VPS, sem Cloudflare R2

Em outubro de 2026 as fotos foram para o Cloudflare R2 e o app quebrou: o imgproxy só lê o bucket do MinIO, então nenhuma foto enviada ao R2 aparecia, e variáveis R2 incompletas derrubavam a API no boot. Voltamos tudo para o MinIO + imgproxy da VPS e a API ignora variáveis `R2_*` que sobraram. CDN ou armazenamento externo só volta com o imgproxy lendo da mesma origem e com teste de ponta a ponta antes do deploy.
