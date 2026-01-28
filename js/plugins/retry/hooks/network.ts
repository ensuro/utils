import { HardhatPluginError } from "hardhat/plugins";
import type { HookContext, NetworkHooks } from "hardhat/types/hooks";
import { ChainType, NetworkConnection } from "hardhat/types/network";

export default async (): Promise<Partial<NetworkHooks>> => {
  const handlers: Partial<NetworkHooks> = {
    async newConnection<ChainTypeT extends ChainType | string>(
      context: HookContext,
      next: (nextContext: HookContext) => Promise<NetworkConnection<ChainTypeT>>
    ): Promise<NetworkConnection<ChainTypeT>> {
      const connection = await next(context);

      console.error("NOTIMPLEMENTED: Hardhat retry plugin is not implemented yet.", connection.provider);

      /*
      class BackoffRetry extends ProviderWrapper {
        // eslint-disable-next-line consistent-return
        async request(args) {
          for (let i = 0; i < MAX_RETRIES; i++) {
            try {
              return await this._wrappedProvider.request(args);
            } catch (e) {
              if (!(e instanceof ProviderError) || i >= MAX_RETRIES - 1) throw e;
              if (e.code === -32000 && (e.message.includes("header not found") || e.message.includes("timeout"))) {
                console.error("Retrying %s because of temp error %s: %s (%s)", args.method, e.code, e.message, e.data);
                await delay(BACKOFF_DELAY_MS);
                continue;
              }
              throw e;
            }
          }
        }
      }
      */
      return connection;
    },
  };

  return handlers;
};
