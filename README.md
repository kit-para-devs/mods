# Mods para Claude Code

Mods gratuitos para Claude Code 2.1.287 o posterior, en la terminal o en la pestaña Code de la app de escritorio.

## Instalar

Dentro de Claude Code, una sola vez:

```
/plugin marketplace add kit-para-devs/mods
```

Luego instala el mod que quieras y recarga:

```
/plugin install tablero-consumo@kit-para-devs
/reload-plugins
```

## Mods disponibles

### tablero-consumo

Escribe `/consumo` para abrir un panel con cinco datos de tu sesión, en vivo mientras Claude trabaja. Pensado para el plan Pro o Max.

1. **Tokens.** El último pedido, separado en entrada, salida y caché, y el total de la sesión.
2. **Uso del plan.** La ventana de 5 horas y el límite semanal, con cuándo se reinicia cada uno, y lo que costaría la sesión por API.
3. **Contexto lleno.**
4. **Herramientas usadas.**
5. **Tiempo de sesión.**

Vuelve a escribir `/consumo`, o presiona Esc, para cerrarlo.

## Antes de instalar cualquier mod

Un mod corre con tus permisos y no está aislado. Revisa qué hace sin ejecutarlo:

```bash
git clone https://github.com/kit-para-devs/mods.git
claude plugin validate ./mods/plugins/tablero-consumo
```

`tablero-consumo` solo lee datos de la sesión y dibuja el panel. No lee archivos, no ejecuta procesos y no hace llamadas de red.

## Licencia

MIT
