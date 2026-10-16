import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			notepad: {
  				DEFAULT: 'hsl(var(--notepad-bg))',
  				foreground: 'hsl(var(--notepad-fg))',
  				border: 'hsl(var(--notepad-border))',
  				'border-focus': 'hsl(var(--notepad-border-focus))'
  			}
  		},
  		fontFamily: {
  			inter: [
  				'Inter',
  				'sans-serif'
  			],
  			serif: [
  				'Lora',
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			cormorant: [
  				'Cormorant Garamond',
  				'serif'
  			],
  			source: [
  				'Source Serif 4',
  				'serif'
  			],
  			mono: [
  				"'Boulder Mono'",
  				'Space Mono',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			],
    		/** The page font (see body in index.css), for places that would otherwise use the mono display font. */
    		body: [
    			"'MM Meta'",
    			'Inter',
    			'ui-sans-serif',
    			'system-ui',
    			'sans-serif'
    		],
    		sans: [
    			'Inter',
    			'ui-sans-serif',
    			'system-ui',
    			'sans-serif',
    			'Apple Color Emoji',
    			'Segoe UI Emoji',
    			'Segoe UI Symbol',
    			'Noto Color Emoji'
    		],
    		meta: [
    			"'MM Meta'",
    			'Inter',
    			'ui-sans-serif',
    			'system-ui',
    			'sans-serif'
    		]
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-in': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(4px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'scale-in': {
  				from: {
  					opacity: '0',
  					transform: 'scale(0.96)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'scale(1)'
  				}
  			},
  			shimmer: {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(100%)'
  				}
  			},
  			'shimmer-slow': {
  				'0%, 100%': {
  					transform: 'translateX(-100%)',
  					opacity: '0'
  				},
  				'50%': {
  					transform: 'translateX(100%)',
  					opacity: '1'
  				}
  			},
  			'shimmer-pulse': {
  				'0%, 100%': {
  					opacity: '0.3'
  				},
  				'50%': {
  					opacity: '0.6'
  				}
  			},
			'rainbow-cycle': {
				'0%': {
					filter: 'hue-rotate(0deg)'
				},
				'100%': {
					filter: 'hue-rotate(360deg)'
				}
			},
			wiggle: {
				'0%, 100%': {
					transform: 'rotate(-1.5deg)'
				},
				'50%': {
					transform: 'rotate(1.5deg)'
				}
			},
			'bounce-gentle': {
				'0%, 100%': { transform: 'translateY(0)' },
				'50%': { transform: 'translateY(-6px)' }
			},
			'draw-line': {
				'0%': { strokeDashoffset: '120' },
				'50%': { strokeDashoffset: '0' },
				'100%': { strokeDashoffset: '-120' }
			},
			'dot-fade': {
				'0%, 100%': { opacity: '0.2', transform: 'scale(0.8)' },
				'50%': { opacity: '1', transform: 'scale(1)' }
			},
			'calendar-pulse': {
				'0%, 100%': { transform: 'scale(1) rotate(0deg)', opacity: '0.7' },
				'50%': { transform: 'scale(1.1) rotate(3deg)', opacity: '1' }
			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.3s ease-out',
  			'scale-in': 'scale-in 0.2s ease-out',
  			shimmer: 'shimmer 3s ease-in-out infinite',
  			'shimmer-slow': 'shimmer-slow 3s ease-in-out infinite',
  			'shimmer-pulse': 'shimmer-pulse 4s ease-in-out infinite',
  			'rainbow-cycle': 'rainbow-cycle 2s linear infinite'
  		},
  		boxShadow: {
  			soft: '0 2px 8px -2px hsl(var(--foreground) / 0.08)',
  			medium: '0 4px 16px -4px hsl(var(--foreground) / 0.12)',
  			focus: '0 0 0 3px hsl(var(--primary) / 0.15)',
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
