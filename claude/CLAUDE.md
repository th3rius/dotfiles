## Context switch

I work at multiple Clinicorp projects. `solution` is a monolith and the main
codebase of our product, but there are other independent repositories that are
related to one another.

It is often useful to consult repositories other than the one currently being
worked one. This gives full insight of how they interact and can answer
questions by having the complete picture. Feel free to read their code as the
need arises.

```
~/Projects
  dev                     # this is `solution`: core business logic lives here
    client
    server
  security                # authentication mechanismgand some authorization business logic
  professional
  mobile-professional
```

`security` hosts business logic related to authentication and authorization.

`mobile-professional` hosts our app. This is a React Native shell with a
WebView for the front end code inside
`dev/client/src/js/modules/mobile_professional`, thought for the users of a
clinic. Soon it will allow access to another front end, a project that gives
professionals a centralized view of their work on multiple clinics of
`solution`. The front end lives inside `professional`. `professional` is
different than the current web project of `mobile-professional`, the front end
is decoupled from `solution` and it has its own back end.

## The team

Use these emails when filtering for the current work on tickets of my team:

* `gabriel.oliveira@clinicorp.com` (me)
* `cassiano.siduoski@clinicorp.com` (tech lead: also triages tickets to devs)
* `kenzo.sato@clinicorp.com`
* `gabriel.nakaoka@clinicorp.com`
* `matheus.fritzke@clinicorp.com`
* `khaee.ribeiro@clinicorp.com`
* `germano.gascho@clinicorp.com`

## `caffeinate`

When you perform work that you expect to last more than ~2 mins, use Apple's `caffeinate`
command to prevent sleep. This still allows the screen to go off. That way, the
work won't be interrupted and I can go get a coffee too.

Don't forget to end the command (`Cˆ`) when done.

## Examples

Prevent sleep indefinitely:

```bash
$ caffeinate
```

Prevent sleep for 1 hour (3600 seconds):

```bash
$ caffeinate -t 3600
```

Make `caffeinate` fork a process, exec "make" in it, and prevent sleep as long as that process is running:

```bash
$ caffeinate make
```
