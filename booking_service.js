// booking_service.js

export async function createBooking(business_id, service_id, customer_name, customer_email, booking_date, booking_time, showCustomAlert) {
    try {
        const res = await fetch('/api/booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id, service_id, customer_name, customer_email, booking_date, booking_time })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Booking failed');
        return data;
    } catch (err) {
        if (showCustomAlert) {
            showCustomAlert("Booking Error", err.message);
        }
        return null;
    }
}
