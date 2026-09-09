<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'code',
        'username',
        'name',
        'email',
        'password',
        'rol',        // superadmin | administrador | tecnico
        'branch',
        'active',
        'telefono',
        'foto_path',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'active' => 'boolean',
        ];
    }

    // ===== Relaciones =====

    /** Órdenes asignadas a este usuario como técnico */
    public function ordenes()
    {
        return $this->hasMany(ServiceOrder::class, 'tecnico_id');
    }

    public function ventas()
    {
        return $this->hasMany(Venta::class, 'tecnico_id');
    }

    public function recibos()
    {
        return $this->hasMany(Recibo::class, 'tecnico_id');
    }

    public function historial()
    {
        return $this->hasMany(HistorialReparacion::class, 'tecnico_id');
    }

    // ===== Helpers de rol (equivalente a tus checks de currentUser.rol en JS) =====

    public function esSuperAdmin(): bool
    {
        return $this->rol === 'superadmin';
    }

    public function esAdministrador(): bool
    {
        return in_array($this->rol, ['superadmin', 'administrador']);
    }

    public function esTecnico(): bool
    {
        return $this->rol === 'tecnico';
    }

    // ===== Iniciales (como tu función initials() de app.js) =====
    public function getInicialesAttribute(): string
    {
        return collect(explode(' ', $this->name))
            ->map(fn ($w) => strtoupper(substr($w, 0, 1)))
            ->take(2)
            ->implode('');
    }
}