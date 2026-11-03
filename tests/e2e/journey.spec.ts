// E2E family: what a real person sees, in a real browser, on desktop and mobile.
import { expect, login, test } from './fixtures';

test.describe('Visitante', () => {
  test('ve el login y el aviso legal', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    await expect(page.getByRole('note', { name: 'Aviso legal' })).toContainText('no es asesoría legal');
    expect(api.pageErrors).toEqual([]);
  });

  test('una contraseña incorrecta muestra un error y no entra', async ({ page, api }) => {
    await login(page, 'incorrecta');
    await expect(page.getByText('Invalid login credentials')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    expect(api.pageErrors).toEqual([]);
  });

  test('la página no tiene desplazamiento horizontal en ninguna pantalla', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Usuario con sesión', () => {
  test('inicia sesión, pregunta a ChatMi y recibe la respuesta', async ({ page, api }) => {
    await login(page);

    const input = page.getByLabel('Mensaje para ChatMi');
    await expect(input).toBeVisible();
    await input.fill('¿Qué necesito para una visa de estudiante?');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();

    await expect(page.getByText('carta de admisión y prueba de fondos')).toBeVisible();
    expect(api.geminiRequests).toHaveLength(1);
    expect(JSON.stringify(api.geminiRequests[0])).toContain('visa de estudiante');
    await expect(page.getByRole('note', { name: 'Aviso legal' })).toBeVisible();
    expect(api.pageErrors).toEqual([]);
  });

  test('si el servidor limita las peticiones, el usuario ve un mensaje claro', async ({ page, api }) => {
    api.geminiStatus = 429;
    await login(page);
    await page.getByLabel('Mensaje para ChatMi').fill('Hola');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText(/Demasiadas solicitudes/)).toBeVisible();
    expect(api.pageErrors).toEqual([]);
  });

  test('la voz es Premium: un usuario gratuito es llevado al plan', async ({ page, api }) => {
    await login(page);
    await page.getByRole('button', { name: 'Hablar con ChatMi' }).click();
    await expect(page.getByRole('heading', { name: 'Desbloquea ChatMi completo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activar Premium' })).toBeVisible();
    expect(api.pageErrors).toEqual([]);
  });
});
