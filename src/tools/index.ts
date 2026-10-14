import { consultarStock, moverAnimales } from './animals';
import { consultarLluvia, registrarLluvia } from './rain';
import { Intent } from './schemas';
import { ToolContext, ToolResult } from './types';
import { deshacerUltimo } from './undo';

export * from './cards';
export * from './intent';
export * from './schemas';
export * from './types';

export function runTool(intent: Intent, ctx: ToolContext): ToolResult {
  switch (intent.tool) {
    case 'registrar_lluvia':
      return registrarLluvia(intent.args, ctx);
    case 'consultar_lluvia':
      return consultarLluvia(intent.args, ctx);
    case 'mover_animales':
      return moverAnimales(intent.args, ctx);
    case 'consultar_stock':
      return consultarStock(intent.args, ctx);
    case 'deshacer_ultimo':
      return deshacerUltimo(intent.args, ctx);
  }
}
