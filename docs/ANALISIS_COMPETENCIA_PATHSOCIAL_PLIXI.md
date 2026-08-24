# Análisis de competencia: Path Social y Plixi (2026-08-24)

Análisis de https://www.pathsocialhq.com/ y https://plixi.com/es para extraer patrones aplicables al empleado digital de marketing (MVP Instagram).

## 1. Qué son

Ambas venden **crecimiento de seguidores de Instagram** como servicio gestionado:

| | Path Social | Plixi |
|---|---|---|
| Propuesta | "Seguidores reales sin bots" vía red de influencers + IA de targeting | "Crecimiento orgánico con IA" (AI-Match™, ads pagados, nano-interacciones, humanos) |
| Promesa | ~4.620 seguidores/mes promedio | ~4.500 seguidores/mes; tiers con rangos garantizados (1.000–5.000+/mes) |
| Precio | Core / Elite (no público sin funnel) | Basic ~COP$66k, Pro ~COP$94k, Experts ~COP$137k /mes (precios geo-localizados a Colombia) |
| Humanos | Equipo interno + red de influencers | Add-on "Plixi Experts™" +$300/mes: account manager dedicado, llamadas, reportes semanales |
| Garantía | "Si no creces, no pagas" (reembolso 1 semana) | "Resultados garantizados o devolución" (7 días en Pro/Experts) |
| Prueba social | 24.000+ clientes, 4.86/5, celebridades, TechCrunch/Forbes | 55.000+ usuarios, logos Revolut/IKEA/Gymshark, G2/Capterra, WSJ |

## 2. Qué NO adoptamos (incompatible con nuestro documento rector)

Su **mecánica central es vender seguidores como resultado garantizado**. Prometer rangos de seguidores/mes implica controlar el crecimiento por medios que Meta no ofrece vía API oficial (redes de engagement, interacciones masivas). En nuestra escala de riesgo eso es **nivel 4 — nunca implementar**:

- Garantías de N seguidores/mes.
- "Nano-interacciones" / actividad automatizada hacia cuentas de terceros.
- Promoción vía redes opacas de influencers sin disclosure.
- Copy que venda seguidores como métrica de éxito.

Nuestro posicionamiento es el opuesto y es defendible: **empleado digital que produce y gestiona contenido/conversaciones vía APIs oficiales, con aprobación humana**. El crecimiento es consecuencia, no producto.

## 3. Qué SÍ extraemos (aplicable y legítimo)

### Producto / features
1. **AI-Match™ (Plixi): entrenamiento de preferencias tipo Tinder.** Deslizar ejemplos para entrenar el modelo. Aplicación directa: en `/marca`, mostrar variantes de captions/tonos/temas y que el cliente apruebe/rechace con un tap; alimentar eso al Quality Gate y a la generación de borradores. Barato de construir sobre lo que ya existe (draft + feedback).
2. **Dashboard de analíticas en tiempo real con reportes personalizados.** Ya lo tenemos en el roadmap (analytics cuando haya cuenta conectada). Patrón a copiar: reporte semanal automático enviado al cliente (Plixi Experts lo vende como premium) — encaja natural como job del worker.
3. **Configuración de audiencia objetivo declarativa** (ubicación, edad, idioma, hashtags, cuentas similares). Nosotros no la usaríamos para targeting de engagement, sino como **contexto de marca para la generación de contenido** (a quién le hablamos → tono, temas, hashtags del calendario editorial). Ampliar la página de marca con esto.
4. **"Setup en 2 minutos" / onboarding sin fricción.** Nuestro OAuth ya es 1 clic; el objetivo es que del OAuth a "primer calendario semanal propuesto" pasen minutos. El flujo planWeek → generate-drafts ya lo permite: convertirlo en onboarding guiado.
5. **Humano en el loop como tier premium, no como excepción.** Plixi cobra +$300/mes por el humano. Nuestro modelo Draft→Approval ya es humano-en-el-loop; se puede empaquetar en dos niveles: "tú apruebas" (base) vs "nuestro estratega revisa y aprueba por ti" (premium/agencia).

### Modelo de negocio / pricing
6. **Tres tiers + add-on humano + programa de agencias (white-label, multi-cuenta).** El programa de agencias es especialmente relevante: nuestro monorepo multi-tenant apunta ahí. Anotar como decisión futura.
7. **Precios geo-localizados** (Plixi muestra COP). Relevante para el piloto colombiano (Pedro, abogado aduanero): anclar precio en COP contra "un community manager junior cuesta X".
8. **Garantía honesta que sí podemos dar:** no "N seguidores" sino "N publicaciones/semana aprobadas y publicadas, 100% respuestas a comentarios/DMs en < X horas, o no pagas". Garantizamos *trabajo entregado* (que controlamos), no métricas de vanidad.

### Funnel / marketing (para nuestra futura landing)
9. Estructura probada por ambos: Hero con diferenciador → estadísticas → casos antes/después con números → testimonios → logos de medios → FAQ que ataca objeciones → CTA repetido.
10. **"Preview My Growth" / calculadora interactiva como lead magnet** (captura email antes de pagar). Nuestra versión: "Auditoría IA gratis de tu Instagram" o "Genera tu primera semana de contenido gratis" — demo real del producto, mucho más honesta que una proyección de seguidores.
11. **FAQ como arma competitiva:** ambos dedican el FAQ a desacreditar bots. Nosotros podemos ir un paso más allá: desacreditar *también* a los vendedores de seguidores (Path/Plixi incluidos) — "los seguidores comprados no compran; el contenido consistente sí".
12. **Páginas de comparativas SEO** ("Plixi vs Nitreo", 15+ en footer): táctica de captura de búsqueda de marca de competidores. Anotar para fase de marketing.
13. Urgencia (countdown), ticker de registros en vivo, ratings de terceros (G2/Capterra): efectivos pero fáciles de hacer mal; usar solo con datos reales.

## 4. Acciones concretas propuestas

- **Corto plazo (encaja en Fase 2):**
  - Extender `/marca` con audiencia objetivo declarativa (campos: ubicación, rango etario, idioma, intereses/hashtags) → inyectar en prompts de planWeek/generate-drafts.
  - Feedback binario sobre borradores (aprobar/rechazar con motivo) persistido, como semilla del "AI-Match propio".
- **Medio plazo:**
  - Reporte semanal automático (job del worker) con lo publicado, respuestas gestionadas y métricas básicas.
  - Onboarding guiado post-OAuth: marca → audiencia → primer calendario en una sesión.
- **Fase comercial:**
  - Pricing 3 tiers + add-on de estratega humano + tier agencia; precios en COP para el piloto.
  - Landing con el patrón de la sección 3.9–3.11 y la garantía de trabajo entregado (3.8).

## 5. Posicionamiento resultante

> Ellos venden seguidores. Nosotros vendemos el trabajo de un empleado de marketing: contenido planificado, publicado y conversaciones atendidas todos los días, con APIs oficiales y tu aprobación. Los seguidores que llegan así, se quedan y compran.
