import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForward, eyeOutline, lockClosedOutline, personOutline } from 'ionicons/icons';
import { RegisterClientRequest, RegisterDriverRequest } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { apiErrorMessage } from '../utils/api-error';

type RegistrationRole = 'client' | 'driver';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [FormsModule, RouterLink, IonIcon],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.scss',
})
export class AuthPageComponent {
  readonly mode: 'login' | 'register';
  readonly currentYear = new Date().getFullYear();
  role: RegistrationRole = 'client';
  login = '';
  password = '';
  name = '';
  email = '';
  phone = '';
  licenseNumber = '';
  plate = '';
  brand = '';
  model = '';
  year = this.currentYear;
  capacity = 4;
  color = '';
  busy = false;
  errorMessage = '';
  showPassword = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.mode = this.route.snapshot.data['mode'] === 'register' ? 'register' : 'login';
    addIcons({ arrowForward, eyeOutline, lockClosedOutline, personOutline });
  }

  submit(): void {
    this.errorMessage = '';
    this.busy = true;
    const request = this.mode === 'login'
      ? this.auth.login(this.login.trim(), this.password)
      : this.auth.register(this.registrationPayload());

    request.pipe(finalize(() => {
      this.busy = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: (user) => {
        void this.router.navigateByUrl(this.auth.roleHome(user.role));
      },
      error: (error: unknown) => {
        this.errorMessage = apiErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  private registrationPayload(): RegisterClientRequest | RegisterDriverRequest {
    const shared = {
      name: this.name.trim(),
      email: this.email.trim(),
      phone: this.phone.trim(),
      password: this.password,
    };

    if (this.role === 'client') {
      return { ...shared, role: 'client' };
    }

    return {
      ...shared,
      role: 'driver',
      license_number: this.licenseNumber.trim(),
      plate: this.plate.trim(),
      brand: this.brand.trim(),
      model: this.model.trim(),
      year: this.year,
      capacity: this.capacity,
      color: this.color.trim(),
    };
  }
}
