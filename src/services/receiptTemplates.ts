export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
}

export function createStreetCoffeeReceipt(width: number = 384): string {
  const canvas = document.createElement('canvas');
  const paddingX = 20;
  const lineHeight = 28;
  const headerHeight = 80;
  const footerHeight = 120;

  const items: ReceiptItem[] = [
    { name: 'Kopi Susu Gula Aren', qty: 1, price: 18000 },
    { name: 'Es Kopi Hitam', qty: 1, price: 15000 },
    { name: 'Roti Bakar Keju', qty: 1, price: 20000 }
  ];

  const subTotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const serviceCharge = Math.round(subTotal * 0.05);
  const total = subTotal + serviceCharge;

  const dynamicHeight =
    headerHeight +
    items.length * lineHeight +
    footerHeight +
    8 * lineHeight;

  canvas.width = width;
  canvas.height = dynamicHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create canvas context for receipt');
  }

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'black';
  ctx.textBaseline = 'top';

  let cursorY = 20;

  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('STREET COFFEE', width / 2, cursorY);

  cursorY += lineHeight + 10;
  ctx.font = '18px Arial';
  ctx.fillText('Jl. Kenangan No. 5, Jakarta', width / 2, cursorY);

  cursorY += lineHeight;
  const now = new Date();
  ctx.font = '16px Arial';
  ctx.fillText(
    `${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')}`,
    width / 2,
    cursorY
  );

  cursorY += lineHeight;
  drawDivider(ctx, width, cursorY);
  cursorY += 10;

  ctx.textAlign = 'left';
  ctx.font = '18px Arial';
  ctx.fillText('Pesanan', paddingX, cursorY);
  ctx.textAlign = 'right';
  ctx.fillText('Total', width - paddingX, cursorY);

  cursorY += lineHeight;
  drawDivider(ctx, width, cursorY);
  cursorY += 15;

  ctx.font = '17px Arial';
  for (const item of items) {
    ctx.textAlign = 'left';
    ctx.fillText(`${item.qty}x ${item.name}`, paddingX, cursorY);
    ctx.textAlign = 'right';
    ctx.fillText(formatCurrency(item.qty * item.price), width - paddingX, cursorY);
    cursorY += lineHeight;
  }

  cursorY += 6;
  drawDivider(ctx, width, cursorY);
  cursorY += 10;

  ctx.font = '16px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Subtotal', paddingX, cursorY);
  ctx.textAlign = 'right';
  ctx.fillText(formatCurrency(subTotal), width - paddingX, cursorY);

  cursorY += lineHeight;
  ctx.textAlign = 'left';
  ctx.fillText('Service 5%', paddingX, cursorY);
  ctx.textAlign = 'right';
  ctx.fillText(formatCurrency(serviceCharge), width - paddingX, cursorY);

  cursorY += lineHeight;
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL', paddingX, cursorY);
  ctx.textAlign = 'right';
  ctx.fillText(formatCurrency(total), width - paddingX, cursorY);

  cursorY += lineHeight + 10;
  drawDivider(ctx, width, cursorY);
  cursorY += 15;

  ctx.textAlign = 'center';
  ctx.font = '18px Arial';
  ctx.fillText('Nomor Pesanan: SC-1024', width / 2, cursorY);

  cursorY += lineHeight;
  ctx.font = '16px Arial';
  ctx.fillText('Kasir: Lina | Meja: Take Away', width / 2, cursorY);

  cursorY += lineHeight + 10;
  drawDivider(ctx, width, cursorY);
  cursorY += 20;

  ctx.font = 'italic 18px Arial';
  ctx.fillText('Terima kasih sudah ngopi!', width / 2, cursorY);

  cursorY += lineHeight;
  ctx.font = '16px Arial';
  ctx.fillText('Follow @streetcoffee.id', width / 2, cursorY);

  cursorY += lineHeight + 10;
  drawDivider(ctx, width, cursorY);

  cursorY += 30;
  ctx.font = '14px Arial';
  ctx.fillText('Simpan struk ini untuk promo berikutnya.', width / 2, cursorY);

  return canvas.toDataURL('image/png');
}

function drawDivider(ctx: CanvasRenderingContext2D, width: number, y: number) {
  ctx.save();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, y);
  ctx.lineTo(width - 10, y);
  ctx.stroke();
  ctx.restore();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

