import { PlatformSettingsController } from '@controllers/PlatformSettingsController';

export function loader(): Promise<Response> { return PlatformSettingsController.publicConfiguration(); }
