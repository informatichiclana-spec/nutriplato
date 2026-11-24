# NutriPlato

App para el móvil (PWA): escanea productos por código de barras, apunta tus comidas por platos y controla calorías, macros, peso e IMC.

## Qué hace
- **Escáner** de códigos de barras con la cámara. Busca el producto en Open Food Facts (incluye Mercadona/Hacendado) y lo guarda en *Mis alimentos*.
- **Puntuación tipo semáforo** (Excelente / Bueno / Mediocre / Malo), con Nutri-Score y NOVA cuando existen.
- **Comidas → platos → alimentos**: desayuno, media mañana, comida, merienda, cena y picoteo. Cada comida admite varios platos (primero, segundo, postre…).
- **Crudo o cocinado**: pasta, arroz, legumbre, carne y pescado se convierten solos (por ejemplo, 150 g de macarrones cocidos ≈ 68 g en crudo).
- **Buscador** en tus productos más una base de unos 170 alimentos genéricos para lo que no tengas escaneado (salchichas, plátano, pollo…). También busca en internet y tiene un apunte rápido de solo calorías.
- **Resumen diario** con colores: calorías, proteínas, hidratos, grasas, azúcar, saturadas, fibra y sal. Avisos de lo que te falta y de lo que te has pasado.
- **Perfil** con objetivos calculados (Mifflin-St Jeor) según tu edad, sexo, altura, peso, actividad y objetivo.
- **Peso semanal**: aviso si llevas más de 7 días sin pesarte. IMC siempre visible, gráficos de peso, IMC y calorías, y un veredicto («Vas bien / regular / mal»).
- Platos favoritos, copiar la comida de ayer, agua y copia de seguridad (exportar/importar).

## Instalar en el móvil
Para usar la cámara, la app tiene que estar en una dirección **https://**. Con subir esta carpeta a un hosting gratuito basta: Netlify Drop, GitHub Pages o Cloudflare Pages.
Después, en el Samsung: abre la dirección en **Chrome** → menú ⋮ → **Añadir a pantalla de inicio → Instalar**.

## Publicar en Google Play (más adelante)
1. Con la app ya publicada en https, ve a https://www.pwabuilder.com e introduce la dirección.
2. Elige **Android → Generate package**. Te da un `.aab` firmado listo para subir.
3. Necesitas una cuenta de Google Play Console (pago único de 25 $). La política de privacidad ya está en `privacidad.html`.
