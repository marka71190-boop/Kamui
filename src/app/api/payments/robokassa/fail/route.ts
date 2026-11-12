/**
 * Fail URL Robokassa — покупатель отказался от оплаты или платёж не прошёл.
 * В личном кабинете Robokassa: Fail URL https://kamui-collection.ru/api/payments/robokassa/fail, метод GET.
 */
import { orderReturnRedirect } from "../return";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = (request: Request) => orderReturnRedirect(request);
export const GET = handle;
export const POST = handle;
