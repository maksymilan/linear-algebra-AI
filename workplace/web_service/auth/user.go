package auth

import "time"

type User struct {
	ID        int       `json:"id"`
	UserIDNo  string    `json:"user_id_no"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}
