<?php

function hello() {
    echo "Hello from PHP\n";
}

class Greeter {
    public function greet() {
        echo "Greetings\n";
    }
}

hello();
$g = new Greeter();
$g->greet();
