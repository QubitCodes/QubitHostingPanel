import { HealthController } from '@controllers/HealthController';

/** Thin health-route entrypoint delegating response construction to the controller. */
export const loader = () => HealthController.show();
