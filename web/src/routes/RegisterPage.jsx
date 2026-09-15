// src/routes/RegisterPage.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiError } from '../lib/ApiError.js';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { ValidationErrorList, FieldError } from '../components/bookings/ValidationErrorList.jsx';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState(null);
  const [genericError, setGenericError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setValidationErrors(null);
    setGenericError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      navigate('/');
    } catch (err) {
      // Switch on the backend's stable `code`, not message text - see
      // src/lib/ApiError.js.
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setValidationErrors(err.details?.errors ?? []);
      } else if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setGenericError('An account with this email already exists.');
      } else {
        setGenericError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <h1>Register</h1>
      {genericError && <ErrorBanner message={genericError} />}
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {/* Field-level errors render right next to the input they
              belong to - this is what makes ValidationErrorList's
              `knownFields` filtering meaningful (it hides these two
              fields from its own fallback list SPECIFICALLY because
              they're shown here instead, not because they're being
              dropped). */}
          <FieldError errors={validationErrors} field="email" />
        </label>
        <label>
          Password (min. 8 characters)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <FieldError errors={validationErrors} field="password" />
        </label>
        <ValidationErrorList errors={validationErrors} knownFields={['email', 'password']} />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
