import { Resend } from 'resend';
import { config } from '../../../config/env';
import { OtpSender } from './interface';

export class EmailOtpSender implements OtpSender {
  private resend = new Resend(config.EMAIL.API_KEY);

  async send(identifier: string, otp: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from: config.EMAIL.FROM,
        to: identifier,
        subject: 'Your OTP Code',
        html: `<p>Your OTP code is: <strong>${otp}</strong></p><p>It will expire in 5 minutes.</p>`,
      });
    } catch (error) {
      console.error('Email sending failed:', error);
      throw new Error('Failed to send OTP email');
    }
  }
}
