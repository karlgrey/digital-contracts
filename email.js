const { Resend } = require('resend');

let resend;
const getResend = () => {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

const FROM_ADDRESS = () => process.env.EMAIL_FROM || 'Stellplatz Buchung <stellplatz@updates.remoterepublic.com>';

/**
 * Send booking confirmation to customer
 */
const sendBookingConfirmation = async (booking) => {
  try {
    const categoryLabels = { outside: 'Außenstellplatz', covered: 'Überdacht', indoor: 'Halle' };
    const startDate = new Date(booking.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const endDate = new Date(booking.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const grossPrice = (booking.monthly_price * 1.19).toFixed(2);

    await getResend().emails.send({
      from: FROM_ADDRESS(),
      to: [booking.email],
      subject: `Buchungsbestätigung #${booking.id} – Stellplatz ${booking.location_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #667eea;">Buchungsbestätigung</h2>
          <p>Hallo ${booking.first_name} ${booking.last_name},</p>
          <p>vielen Dank für Ihre Buchung. Hier eine Zusammenfassung:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Buchungsnummer</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">#${booking.id}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Standort</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.location_name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Kategorie</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${categoryLabels[booking.category] || booking.category}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Fahrzeugtyp</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.vehicle_label}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Mietbeginn</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${startDate}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Mietende</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${endDate}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Monatsmiete (brutto)</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">€ ${grossPrice}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Kaution</td><td style="padding: 8px; border-bottom: 1px solid #eee;">€ ${booking.caution.toFixed(2)}</td></tr>
          </table>
          <p>Ihr Vertrag wird jetzt vom Vermieter geprüft und unterschrieben. Sie erhalten eine weitere E-Mail, sobald der Vertrag vollständig abgeschlossen ist.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Diese E-Mail wurde automatisch generiert.</p>
        </div>
      `
    });
    console.log(`✉ Booking confirmation sent to ${booking.email}`);
  } catch (error) {
    console.error('Error sending booking confirmation:', error);
  }
};

/**
 * Send notification to admin/company when new booking arrives
 */
const sendAdminNotification = async (booking, adminEmail) => {
  if (!adminEmail) return;

  try {
    await getResend().emails.send({
      from: FROM_ADDRESS(),
      to: [adminEmail],
      subject: `Neue Buchung #${booking.id} – ${booking.first_name} ${booking.last_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #667eea;">Neue Buchung eingegangen</h2>
          <p>Eine neue Buchung wartet auf Ihre Unterschrift:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Buchungsnummer</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">#${booking.id}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Kunde</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.first_name} ${booking.last_name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">E-Mail</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.email}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Standort</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.location_name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Fahrzeugtyp</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.vehicle_label}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Monatsmiete (netto)</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">€ ${booking.monthly_price.toFixed(2)}</td></tr>
          </table>
          <p style="margin-top: 24px;">
            <a href="${process.env.BASE_URL || 'https://str.remoterepublic.com'}/admin.html"
               style="display: inline-block; background: #667eea; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
              Vertrag prüfen &amp; unterschreiben
            </a>
          </p>
        </div>
      `
    });
    console.log(`✉ Admin notification sent to ${adminEmail}`);
  } catch (error) {
    console.error('Error sending admin notification:', error);
  }
};

/**
 * Send completed contract with PDF to customer and company
 */
const sendContractCompleted = async (booking, pdfBuffer, companyEmail) => {
  const recipients = [booking.email];
  if (companyEmail) recipients.push(companyEmail);

  try {
    await getResend().emails.send({
      from: FROM_ADDRESS(),
      to: recipients,
      subject: `Vertrag abgeschlossen #${booking.id} – Stellplatz ${booking.location_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #28a745;">Vertrag vollständig unterzeichnet</h2>
          <p>Hallo ${booking.first_name} ${booking.last_name},</p>
          <p>Ihr Stellplatzmietvertrag #${booking.id} wurde von beiden Parteien unterzeichnet und ist damit abgeschlossen.</p>
          <p>Den vollständigen Vertrag finden Sie als PDF im Anhang.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Standort</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.location_name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Mietbeginn</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(booking.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Mietende</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(booking.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</td></tr>
          </table>
          <p>Bei Fragen wenden Sie sich bitte an Ihren Vermieter.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Diese E-Mail wurde automatisch generiert.</p>
        </div>
      `,
      attachments: [
        {
          filename: `Vertrag_${booking.id}.pdf`,
          content: pdfBuffer
        }
      ]
    });
    console.log(`✉ Contract PDF sent to ${recipients.join(', ')}`);
  } catch (error) {
    console.error('Error sending contract completed email:', error);
  }
};

module.exports = {
  sendBookingConfirmation,
  sendAdminNotification,
  sendContractCompleted
};
