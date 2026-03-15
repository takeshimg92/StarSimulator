# Star simulator app

Concept: we are building an app (first locally, then hosted online) with educational and visualization purposes. Our goal: show a 3D rendering of a main sequence star with realistic physics. The user is able to, via mouse clicks/movements as well as through sliders, control global physical quantities such as pressure, temperature, mass, etc. 

# The basic design

* The main screen (Div 1) shows a slowly rotating star in the center, with a dark background. There is a "reset state" button to start over.
* On the left side, we have sliders for various quantities: temperature, radius, mass.
* I also want to have sliders for fundamental quantities: electron charge, proton mass, speed of light (later we can add more). 
* On the bottom right, I want a text display (with LaTeX enabled) which can show equations. At some point, we will add an LLM-based explanation of what is happening; for now, it should just shuffle through the basic equations of stellar structure.
* We will have a few additional mini-screens on the right side of the screen:
    - One (Div 2) represents the temperature and density profiles, from r=0 to r=R. It is a graph.
    - One (Div 3) shows a schematics of particle motion in the nucleus. Imagine gas particles moving around. Their mean motion is the temperature, and we can show the temperature number fluctuating
    - One (Div 4) shows the relative populations of species, like neutral hydrogen, 

# The physics
We are mostly interested in the [equations of stellar structure](https://en.wikipedia.org/wiki/Stellar_structure#Equations_of_stellar_structure) for spherically symmetric stars and their perturbed versions. We need perturbations since we want relatively realistic propagation of perturbations if the user interacts with the system.

The physics we want the user to be exposed to are:
1. Hydrostatic equilibrium
2. CNO and PP cycles; Gamow peaks
3. Convective and radiative transfer; opacity
4. Ionization (Saha)

In this first iteration, we do *not* consider white dwarves / neutron stars / black holes, nor events like late-stage solar winds, accretion etc. If the user brings parameters to these regions, we will show a "Oops! You killed your star. Want to start again?" warning.

We should probably use techniques used in video-game development for realistic fast rendering. We can consider the star probably in cells, and use heuristics, lattice Boltzmann-like methods, or grid-based methods too. I am *very* open to suggestions since this outside my main field of expertise.


# User stories
* As a user, I want to click on the star's surface to perturb it. I want to see this affecting the temperature/density curves, the change in the radiated power.
* As a user, I want to move the slider to higher temperatures and see the star uniformly change structure. 


# Your role
* Always plan thoroughly and discuss with the user before writing code.
* Let us launch features in stages. Propose, based on what I've written so far, what the MVP is and what consequent versions may add.
* Less is more when it comes to code. 
* You are free to choose the structure for this repo. 
