# Microafia Health

A modern healthcare management platform for booking appointments, lab services, wellness programs, and imaging services.

## Features

- **Appointment Booking** - Schedule medical consultations
- **Lab Services** - Order laboratory tests and view results
- **Wellness Programs** - Book health and wellness services
- **Imaging Services** - Request medical imaging appointments
- **Admin Dashboard** - Manage all bookings, messages, and settings

## Tech Stack

- HTML5, CSS3, JavaScript
- Firebase (Authentication & Firestore)
- Font Awesome Icons

## Getting Started

1. Clone the repository
```bash
git clone https://github.com/Noxar254/Microafia-Health.git
```

2. Configure Firebase
   - Update `firebase-config.js` with your Firebase credentials

3. Open `index.html` in your browser or deploy to your hosting service

## Project Structure

```
├── index.html          # Main landing page
├── book-appointment.*  # Appointment booking
├── lab-services.*      # Lab services
├── book-wellness.*     # Wellness programs
├── imaging-services.*  # Imaging services
├── admin/              # Admin dashboard
│   ├── index.html      # Dashboard home
│   ├── appointments.*  # Manage appointments
│   ├── lab-orders.*    # Manage lab orders
│   ├── wellness.*      # Manage wellness bookings
│   ├── messages.*      # View messages
│   ├── callbacks.*     # Callback requests
│   ├── users.*         # User management
│   ├── settings.*      # System settings
│   └── profile.*       # User profile
└── images/             # Image assets
```

## License

MIT License
