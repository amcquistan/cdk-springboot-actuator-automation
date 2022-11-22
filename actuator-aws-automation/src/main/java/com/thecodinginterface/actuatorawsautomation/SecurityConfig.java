package com.thecodinginterface.actuatorawsautomation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    static final Logger logger = LoggerFactory.getLogger(SecurityConfig.class);

    @Value("${aws.actuator.secret}")
    public String actuatorSecret;

    @Value("${aws.region}")
    public String awsRegion;

    public ActuatorAuthCreds actuatorAuthCreds() throws JsonProcessingException {
        if (actuatorSecret == null || !actuatorSecret.startsWith("/greeter")) {
            return new ActuatorAuthCreds("actuator", "Develop3r");
        }

        var secretsMgr = makeSecretsManagerClient();

        GetSecretValueResponse response = secretsMgr.getSecretValue(
            GetSecretValueRequest.builder().secretId(actuatorSecret).build()
        );

        ObjectMapper objMapper = new ObjectMapper();
        try {
            return objMapper.readValue(response.secretString(), ActuatorAuthCreds.class);
        } finally {
            secretsMgr.close();
        }
    }

    public SecretsManagerClient makeSecretsManagerClient() {
        return SecretsManagerClient.builder()
                .region(Region.of(awsRegion))
                .build();
    }

    @Bean
    public UserDetailsService userDetailsService(PasswordEncoder passwordEncoder) {
        ActuatorAuthCreds authCreds = null;
        try {
            authCreds = actuatorAuthCreds();
        } catch (JsonProcessingException e) {
            logger.error("failed fetching actuator creds", e);
        }

        UserDetails actuator = User.builder()
                .username(authCreds.getUsername())
                .password(passwordEncoder.encode(authCreds.getPassword()))
                .roles("ACTUATOR", "ADMIN", "USER")
                .build();

        return new InMemoryUserDetailsManager(actuator);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf().disable().authorizeRequests()
                .antMatchers("/actuator/health").anonymous()
                .antMatchers("/greet/**").anonymous()
                .anyRequest()
                    .authenticated()
                    .and()
                    .httpBasic();
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        return encoder;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    static final public class ActuatorAuthCreds {
        private String username;
        private String password;
    }
}
