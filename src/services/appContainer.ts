/**
 * Service Lifecycle Management - AppContainer (A2)
 * Coordinates the initialization and graceful shutdown of core services.
 */

import { logger } from "./loggerService";
import { eventBus } from "./eventBus";

export interface ManagedService {
  readonly id: string;
  init?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

class AppContainer {
  private services = new Map<string, ManagedService>();
  private isInitialized = false;

  /**
   * Registers a service into the container
   */
  public register<T extends ManagedService>(service: T): T {
    if (this.services.has(service.id)) {
      logger.warn("AppContainer", `Service '${service.id}' is already registered, replacing.`);
    }
    this.services.set(service.id, service);
    return service;
  }

  /**
   * Retrieves a registered service by id
   */
  public get<T extends ManagedService>(id: string): T | undefined {
    return this.services.get(id) as T | undefined;
  }

  /**
   * Initializes all registered services in sequence
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("AppContainer", "AppContainer already initialized, skipping.");
      return;
    }

    logger.info("AppContainer", "Initializing application services...");

    for (const [id, service] of this.services.entries()) {
      try {
        if (service.init) {
          logger.info("AppContainer", `Initializing service: ${id}`);
          await service.init();
        }
      } catch (err) {
        logger.error("AppContainer", `Failed to initialize service '${id}': ${err}`);
      }
    }

    this.isInitialized = true;
    logger.info("AppContainer", "All application services initialized successfully.");
  }

  /**
   * Gracefully tears down all services in reverse order
   */
  public async dispose(): Promise<void> {
    logger.info("AppContainer", "Disposing all application services...");

    const serviceList = Array.from(this.services.entries()).reverse();
    for (const [id, service] of serviceList) {
      try {
        if (service.dispose) {
          logger.info("AppContainer", `Disposing service: ${id}`);
          await service.dispose();
        }
      } catch (err) {
        logger.error("AppContainer", `Error while disposing service '${id}': ${err}`);
      }
    }

    // Clear eventBus listeners
    eventBus.clear();
    this.isInitialized = false;
    logger.info("AppContainer", "All application services disposed.");
  }

  public getRegisteredServiceIds(): string[] {
    return Array.from(this.services.keys());
  }
}

export const appContainer = new AppContainer();
