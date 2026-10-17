# Agendal

Agendal is a personal productivity and task management web application developed as the final project for **Advanced Web Design**.

The application helps users organize tasks, manage projects, schedule activities, track habits, and monitor their productivity from one centralized workspace.

## Team Members

| Name | Student ID |
| :--- | :--- |
| Ho Anh Tuan | 23020016 |
| Ngo Hoang Nhat Khang | 23020004 |
| Nguyen Nghia Tuan | 23020003 |

## Project Overview

Managing tasks, schedules, projects, and personal routines across multiple applications can be inconvenient. Users may need one application for calendars, another for task lists, and another for tracking long-term goals.

Agendal combines these functions into one simple productivity platform. Users can create tasks, organize them into projects, schedule work, track habits, receive reminders, and review their progress through statistics.

The application is designed around the following core features:

- Personal user accounts
- Task and project management
- Habit tracking
- Calendar-based scheduling
- Reminders and notifications
- Productivity statistics
- Search and filtering
- Premium subscriptions
- Administration tools

## Main Features

### User Accounts

Users can:

- Register for an account
- Log in and log out
- Reset a forgotten password
- Change their password
- Manage their personal profile
- Configure their preferred theme and interface settings
- Delete their account and associated data

Each user's tasks, habits, categories, and subscriptions are kept separate from other users.

### Task Management

Users can create and manage personal tasks with the following information:

- Title
- Description
- Due date and time
- Priority
- Category
- Colour
- Completion status
- Reminder time
- Recurrence settings

Tasks can be:

- Created with only a title
- Edited
- Marked as complete
- Reopened
- Soft deleted
- Restored after deletion
- Searched and filtered
- Repeated daily, weekly, or monthly

### Project and Category Organization

Tasks can be grouped using categories and projects. Users can:

- Create categories
- Rename categories
- Assign colours to categories
- Filter tasks by category
- View the number of completed and incomplete tasks
- Organize related tasks under a common goal

Tasks without a selected category are placed in a default Inbox category.

### Habit Tracking

Agendal allows users to create and track habits.

Users can:

- Create a habit
- Set a target frequency
- Record daily check-ins
- View their current streak
- View their longest streak
- Monitor their completion rate
- Track progress over time

Example habits include:

- Exercise every day
- Read three times per week
- Review notes every weekday
- Practice a skill weekly

### Calendar

The calendar provides day, week, and month views for scheduled tasks and habit check-ins.

Users can:

- View scheduled tasks by date and time
- Create a task by selecting a date
- Review upcoming work
- Identify busy periods
- Reschedule tasks
- View tasks using their category colours

### Statistics Dashboard

The dashboard provides an overview of a user's productivity, including:

- Today's tasks
- Weekly completion rate
- Monthly completion rate
- Habit streaks
- Completion progress
- Tasks grouped by category
- Productivity trends

Premium users can access advanced statistics and export selected data as CSV files.

### Reminders and Notifications

Users can create reminders for tasks and habits.

Reminders may be sent through email or web notifications, depending on the configured application services.

The reminder system supports:

- Reminders for scheduled tasks
- Custom reminder dates and times
- Habit reminders
- Background processing through queued jobs
- Daily task summaries

### Search and Filtering

Users can quickly find tasks by searching for keywords in their title or description.

Tasks can also be filtered by:

- Keyword
- Category
- Priority
- Completion status
- Due date
- Date range

Search results show relevant task information such as the title, category, priority, and due date.

### Premium Subscription

Agendal supports Free and Premium subscription plans.

#### Free Plan

The Free plan provides access to the core productivity features with selected limits, such as:

- Limited number of active habits
- Limited number of categories
- Basic productivity statistics

#### Premium Plan

The Premium plan provides additional features, including:

- Unlimited habits
- Unlimited categories
- Advanced statistics
- CSV data export
- Additional themes
- Extended productivity insights

Payments are handled through Stripe Checkout in test mode. Payment confirmation uses database transactions to ensure that payment records, subscriptions, and user plans remain consistent.

### Administration

Administrators can access a separate administration area to:

- View users
- Lock or unlock user accounts
- View subscriptions
- View payment records
- Review basic system statistics
- Monitor application activity

Only users with administrator privileges can access administrative features.

## Technologies

| Area | Technology |
| :--- | :--- |
| Frontend | EJS |
| Styling | Tailwind CSS |
| UI Components | DaisyUI |
| Backend | Node.js and Express.js |
| Database | MongoDB |
| Version Control | Git and GitHub |
| Design | Figma |
| Continuous Integration | GitHub Actions |
| Container Registry | GitHub Container Registry |

## System Architecture

Agendal follows a server-side rendered web application architecture.

The main components are:

1. **Client Interface**
   - EJS templates
   - Tailwind CSS
   - DaisyUI components
   - Responsive layouts for desktop and mobile browsers

2. **Express.js Application**
   - Handles routing
   - Processes authentication
   - Validates requests
   - Provides application services
   - Renders EJS pages
   - Manages access control

3. **MongoDB Database**
   - Stores users
   - Stores tasks and categories
   - Stores habits and check-ins
   - Stores reminders
   - Stores subscriptions and payments

4. **Background Jobs**
   - Process reminders
   - Generate recurring tasks
   - Update expired subscriptions
   - Send email notifications

5. **Administration Module**
   - Provides user and subscription management
   - Displays system statistics
   - Restricts administrative actions to authorized users

## Core Data Models

The application uses the following main data models:

- User
- Task
- Category
- Habit
- Habit Check-in
- Reminder
- Subscription
- Payment
- Notification

### Relationships

- A user can have many tasks.
- A user can have many categories.
- A category can contain many tasks.
- A user can have many habits.
- A habit can have many check-ins.
- A task or habit can have reminders.
- A user can have one active subscription.
- A subscription can have multiple payment records.

## Security

The application includes the following security measures:

- Passwords are hashed before storage.
- User data is isolated by account.
- Protected routes require authentication.
- Administrative routes require administrator privileges.
- User input is validated before processing.
- Database queries are restricted to authorized users.
- Sensitive configuration values are stored in environment variables.
- HTTPS should be used when deploying the application.
- Login attempts should be protected against brute-force attacks.

## Performance and Reliability

Agendal is designed with the following goals:

- Main pages should load quickly on a typical broadband connection.
- Task creation should provide immediate feedback.
- Search results should appear without unnecessary delay.
- Database queries should use indexes where appropriate.
- Frequently accessed data may be cached.
- Background work should be processed asynchronously.
- Database operations involving payments and subscriptions should use transactions.
- Errors should be logged for debugging and monitoring.

## Project Structure

A possible project structure is:

```text
.
├── app.js
├── package.json
├── package-lock.json
├── .env.example
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── jobs/
├── validators/
├── views/
│   ├── layouts/
│   ├── auth/
│   ├── tasks/
│   ├── habits/
│   ├── calendar/
│   ├── dashboard/
│   └── admin/
├── public/
│   ├── css/
│   ├── js/
│   └── images/
├── tests/
└── README.md
```

## Installation

### Prerequisites

Make sure the following software is installed:

- Node.js
- npm
- MongoDB
- Git

### Clone the Repository

```bash
git clone https://github.com/khang-ngo4444/Thay_Dinh_Dep_Trai.git
cd Thay_Dinh_Dep_Trai
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file based on `.env.example`.

Example configuration:

```env
PORT=3000
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017/agendal

SESSION_SECRET=replace-with-a-secure-secret

MAIL_HOST=
MAIL_PORT=
MAIL_USERNAME=
MAIL_PASSWORD=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Do not commit the `.env` file to the repository.

### Start the Development Server

```bash
npm run dev
```

The application should then be available at:

```text
http://localhost:3000
```

### Start the Production Server

```bash
npm start
```

## Available Scripts

The available scripts may include:

```bash
npm run dev       # Start the development server
npm start         # Start the production server
npm test          # Run automated tests
npm run lint      # Check code style
npm run format    # Format source files
```

## Testing

Automated tests should cover the main user flows, including:

- User registration
- User login
- User logout
- Password reset
- Task creation
- Task editing
- Task completion
- Task deletion
- Task restoration
- Habit creation
- Habit check-in
- Category management
- Reminder creation
- Subscription payments
- Administrative access control

Run the test suite with:

```bash
npm test
```

## Development Workflow

The team uses Git and GitHub for collaboration.

Recommended workflow:

1. Create a feature branch.
2. Implement the feature.
3. Add or update tests.
4. Run linting and automated tests.
5. Commit the changes.
6. Push the branch to GitHub.
7. Open a pull request.
8. Review and merge the pull request.

Example:

```bash
git checkout -b feature/task-management
git add .
git commit -m "Add task management features"
git push origin feature/task-management
```

## Project Scope

### In Scope

- User registration and authentication
- User profiles and settings
- Task creation and management
- Task priorities and due dates
- Categories and project organization
- Recurring tasks
- Habit tracking
- Calendar views
- Productivity statistics
- Reminders
- Search and filtering
- Premium subscriptions
- Stripe test payments
- Subscription and payment history
- Administration dashboard
- Database migrations and seed data
- Automated testing
- GitHub Actions CI

### Out of Scope

- Advanced artificial intelligence features
- Real-money production payment processing
- Large-scale production deployment
- Native mobile applications
- Complex enterprise project management features

## Expected Outcomes

At the end of the project, Agendal is expected to provide a functional productivity management system that allows users to:

- Create and manage personal tasks
- Organize tasks into categories and projects
- Schedule tasks using a calendar
- Track habits and streaks
- Receive reminders
- Search and filter their data
- Review productivity statistics
- Subscribe to a Premium plan
- Manage their account securely

## Deliverables

The final project deliverables include:

- GitHub repository
- Source code
- Database schema
- Database seed data
- User interface based on the Figma design
- Automated tests
- GitHub Issues and Pull Requests
- GitHub Actions workflow
- Project documentation
- ERD and system design documentation
- Demonstration video of up to 10 minutes

## Project Status

This project is developed as part of the **Advanced Web Design** course.

The application is currently under development.

## License

This project was created for educational purposes as part of the Advanced Web Design course.
