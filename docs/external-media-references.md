# Referencias externas consultadas

## Compresión de vídeo e imágenes

- `https://libraries.io/npm/expo-image-and-video-compressor`
  - Paquete consultado: `expo-image-and-video-compressor`.
  - La documentación consultada indica compatibilidad con Expo SDK 51 o posterior y API `compress(fileUrl, options, onProgress)` para vídeo.
  - También documenta `getMetadata(fileUrl)` con duración y tamaño, opciones de resolución, bitrate, codec y progreso.
  - API utilizada en Sky Night: `compress`, `getMetadata`, límite de 15 segundos, límite de 80 MB de origen, objetivo de 25 MB comprimido, H.264 y resolución máxima de 720.

- `https://www.npmjs.com/package/react-native-compressor`
  - Alternativa revisada. Requiere añadir el plugin `react-native-compressor` y una nueva compilación nativa.
  - Se descartó en favor de `expo-image-and-video-compressor` por su documentación de Expo Module sin configuración nativa adicional.

- `https://docs.expo.dev/versions/latest/sdk/video/`
  - Referencia de `expo-video` para reproducción y estados de carga.

## Caché de imágenes

- Documentación local de Expo SDK 54: `/home/ubuntu/socialsip_helper/docs/media/image/DOCS.md`.
  - `expo-image` ofrece caché de memoria y disco, transiciones y carga optimizada.

## Mapas

- Documentación local de `react-native-maps`: `/home/ubuntu/socialsip_helper/docs/location/maps/DOCS.md`.
  - El mapa admite `MapView`, `pitchEnabled`, `rotateEnabled`, `camera` y perspectiva inclinada en builds nativos.
  - Se debe usar `onRegionChangeComplete` para evitar trabajo excesivo durante cada movimiento.
