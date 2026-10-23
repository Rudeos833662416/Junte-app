# Investigación de fuentes para lugares de bebida

## Nominatim / OpenStreetMap

La documentación oficial de Nominatim indica que su endpoint `/search` permite convertir descripciones o direcciones en ubicaciones y admite consultas libres o estructuradas. También advierte que Nominatim no debe usarse para descargar listados completos de POI; para conjuntos completos por tipo debe usarse Overpass u otra fuente de datos. Fuente: https://nominatim.org/release-docs/latest/api/Search/

La política pública de Nominatim limita el uso a un máximo absoluto de una solicitud por segundo, exige un User-Agent o HTTP Referer identificable y atribución visible. Las búsquedas iniciadas directamente por el usuario son aceptables con un número moderado de usuarios, pero se recomienda proxy y caché; no se permite implementar autocompletado ni consultas sistemáticas. Fuente: https://operations.osmfoundation.org/policies/nominatim/

## Decisión de arquitectura

Sky Night usará búsquedas iniciadas explícitamente por el usuario y consultas de lugares cercanos con caché local/Supabase, no una descarga de todos los bares de Venezuela. Se conservará la atribución de OpenStreetMap en la pantalla de selección. Para producción a mayor escala, la aplicación debe poder cambiar a un proveedor propio o comercial sin actualizar el APK.
